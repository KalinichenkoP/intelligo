/**
 * Typed shapes for DocketAlarm login/ and search/ responses.
 * Validated at the HTTP boundary via type guards — never trusted as-is.
 */

export interface DocketAlarmLoginResponse {
  success: boolean;
  login_token?: string;
  error?: string;
}

export interface DocketAlarmSearchResultItem {
  result_type?: string;
  court?: string;
  docket?: string;
  title?: string;
  link?: string;
  date_filed?: string;
}

export interface DocketAlarmSearchResponse {
  success: boolean;
  count?: number;
  search_results?: DocketAlarmSearchResultItem[];
  error?: string;
}

/**
 * Parameters for a DocketAlarm search/ request.
 */
export interface DocketAlarmSearchParams {
  q: string;
  limit: number;
  offset: number;
  order?: string;
}

/**
 * Narrowed, validated search page returned by the HTTP client.
 */
export interface DocketAlarmSearchPage {
  count: number;
  results: Required<
    Pick<
      DocketAlarmSearchResultItem,
      'court' | 'docket' | 'title' | 'link' | 'date_filed' | 'result_type'
    >
  >[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseLoginResponse(payload: unknown): DocketAlarmLoginResponse {
  if (!isRecord(payload)) {
    throw new Error('Invalid DocketAlarm login response: expected object');
  }
  const success = payload.success === true;
  const loginToken =
    typeof payload.login_token === 'string' ? payload.login_token : undefined;
  const error = typeof payload.error === 'string' ? payload.error : undefined;
  return { success, login_token: loginToken, error };
}

export function parseSearchResponse(payload: unknown): DocketAlarmSearchResponse {
  if (!isRecord(payload)) {
    throw new Error('Invalid DocketAlarm search response: expected object');
  }
  const success = payload.success === true;
  const count = typeof payload.count === 'number' ? payload.count : undefined;
  const error = typeof payload.error === 'string' ? payload.error : undefined;

  let search_results: DocketAlarmSearchResultItem[] | undefined;
  if (Array.isArray(payload.search_results)) {
    search_results = payload.search_results.map((item): DocketAlarmSearchResultItem => {
      if (!isRecord(item)) {
        return {};
      }
      return {
        result_type: typeof item.result_type === 'string' ? item.result_type : undefined,
        court: typeof item.court === 'string' ? item.court : undefined,
        docket: typeof item.docket === 'string' ? item.docket : undefined,
        title: typeof item.title === 'string' ? item.title : undefined,
        link: typeof item.link === 'string' ? item.link : undefined,
        date_filed: typeof item.date_filed === 'string' ? item.date_filed : undefined,
      };
    });
  }

  return { success, count, search_results, error };
}
