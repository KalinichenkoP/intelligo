import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { AppConfig } from '../../config/configuration';
import { DocketAlarmTokenStore } from './docket-alarm-token-store';
import {
  DocketAlarmSearchPage,
  DocketAlarmSearchParams,
  parseLoginResponse,
  parseSearchResponse,
} from './docket-alarm.types';

/**
 * Error thrown when DocketAlarm returns success:false or an unexpected shape.
 * Mapped to HTTP 503 by the orchestration layer.
 */
export class DocketAlarmUpstreamError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DocketAlarmUpstreamError';
  }
}

/**
 * Low-level HTTP client for DocketAlarm login/ and search/ endpoints.
 *
 * Responsibilities:
 * - Obtain / refresh login_token via DocketAlarmTokenStore
 * - Retry once after invalidating the token on auth failure
 * - Validate response shapes with type guards (no `any`)
 *
 * Transient retries / backoff for network errors are handled by BullMQ job attempts
 * at the queue layer — this client does not implement its own retry loop for 5xx.
 */
@Injectable()
export class DocketAlarmHttpClient {
  private readonly logger = new Logger(DocketAlarmHttpClient.name);
  private readonly http: AxiosInstance;
  private readonly username: string;
  private readonly password: string;
  private readonly clientMatter: string;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly tokenStore: DocketAlarmTokenStore,
  ) {
    const da = this.configService.get('docketAlarm', { infer: true });
    this.username = da.username;
    this.password = da.password;
    this.clientMatter = da.clientMatter;
    this.http = axios.create({
      baseURL: da.baseUrl.endsWith('/') ? da.baseUrl : `${da.baseUrl}/`,
      timeout: 15_000,
      headers: {
        Accept: 'application/json',
      },
    });
  }

  /**
   * Execute a DocketAlarm search/ request with automatic token management.
   */
  async search(params: DocketAlarmSearchParams): Promise<DocketAlarmSearchPage> {
    return this.withAuth((token) => this.executeSearch(token, params));
  }

  /**
   * Run `fn` with a valid login token, refreshing once on auth failure.
   */
  private async withAuth<T>(fn: (token: string) => Promise<T>): Promise<T> {
    let token = await this.tokenStore.getToken();
    if (token === null) {
      token = await this.login();
    }

    try {
      return await fn(token);
    } catch (error: unknown) {
      if (!this.isAuthFailure(error)) {
        throw error;
      }
      this.logger.warn('DocketAlarm auth failure — refreshing login_token');
      await this.tokenStore.clearToken();
      const freshToken = await this.login();
      return fn(freshToken);
    }
  }

  private async login(): Promise<string> {
    try {
      const response = await this.http.post<unknown>(
        'login/',
        new URLSearchParams({
          username: this.username,
          password: this.password,
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      const parsed = parseLoginResponse(response.data);
      if (!parsed.success || parsed.login_token === undefined) {
        throw new DocketAlarmUpstreamError(
          `DocketAlarm login failed: ${parsed.error ?? 'unknown error'}`,
        );
      }

      await this.tokenStore.setToken(parsed.login_token);
      return parsed.login_token;
    } catch (error: unknown) {
      if (error instanceof DocketAlarmUpstreamError) {
        throw error;
      }
      throw new DocketAlarmUpstreamError('DocketAlarm login request failed', error);
    }
  }

  private async executeSearch(
    token: string,
    params: DocketAlarmSearchParams,
  ): Promise<DocketAlarmSearchPage> {
    try {
      const response = await this.http.get<unknown>('search/', {
        params: {
          login_token: token,
          client_matter: this.clientMatter,
          q: params.q,
          limit: params.limit,
          offset: params.offset,
          o: params.order ?? '-date_filed',
        },
      });

      const parsed = parseSearchResponse(response.data);
      if (!parsed.success) {
        // DocketAlarm may signal invalid token via success:false
        if (this.looksLikeAuthError(parsed.error)) {
          throw new AuthFailureError(parsed.error ?? 'invalid token');
        }
        throw new DocketAlarmUpstreamError(
          `DocketAlarm search failed: ${parsed.error ?? 'unknown error'}`,
        );
      }

      const results = (parsed.search_results ?? [])
        .filter(
          (item) =>
            typeof item.court === 'string' &&
            item.court.length > 0 &&
            typeof item.docket === 'string' &&
            item.docket.length > 0,
        )
        .map((item) => ({
          court: item.court as string,
          docket: item.docket as string,
          title: item.title ?? '',
          link: item.link ?? '',
          date_filed: item.date_filed ?? '',
          result_type: item.result_type ?? 'docket',
        }));

      return {
        count: parsed.count ?? results.length,
        results,
      };
    } catch (error: unknown) {
      if (
        error instanceof DocketAlarmUpstreamError ||
        error instanceof AuthFailureError
      ) {
        throw error;
      }
      if (axios.isAxiosError(error) && this.isAxiosAuthFailure(error)) {
        throw new AuthFailureError('HTTP auth failure');
      }
      throw new DocketAlarmUpstreamError('DocketAlarm search request failed', error);
    }
  }

  private isAuthFailure(error: unknown): boolean {
    return error instanceof AuthFailureError;
  }

  private isAxiosAuthFailure(error: AxiosError): boolean {
    return error.response?.status === 401 || error.response?.status === 403;
  }

  private looksLikeAuthError(message: string | undefined): boolean {
    if (message === undefined) {
      return false;
    }
    const lower = message.toLowerCase();
    return (
      lower.includes('login') ||
      lower.includes('token') ||
      lower.includes('auth') ||
      lower.includes('password')
    );
  }
}

/**
 * Internal signal that the current login_token is invalid and should be refreshed.
 */
class AuthFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthFailureError';
  }
}
