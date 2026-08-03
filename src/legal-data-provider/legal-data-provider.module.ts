import { Module } from '@nestjs/common';
import { LEGAL_DATA_PROVIDER } from './interfaces/legal-data-provider.interface';
import { DocketAlarmHttpClient } from './docket-alarm/docket-alarm-http.client';
import { DocketAlarmProvider } from './docket-alarm/docket-alarm.provider';
import { DocketAlarmTokenStore } from './docket-alarm/docket-alarm-token-store';

/**
 * Wires the DocketAlarm adapter behind LegalDataProviderPort.
 * Swap the provider binding here to introduce another data source later.
 */
@Module({
  providers: [
    DocketAlarmTokenStore,
    DocketAlarmHttpClient,
    DocketAlarmProvider,
    {
      provide: LEGAL_DATA_PROVIDER,
      useExisting: DocketAlarmProvider,
    },
  ],
  exports: [LEGAL_DATA_PROVIDER, DocketAlarmTokenStore],
})
export class LegalDataProviderModule {}
