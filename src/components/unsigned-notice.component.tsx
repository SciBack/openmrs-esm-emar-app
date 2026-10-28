import React from 'react';
import { useTranslation } from 'react-i18next';
import { InlineNotification } from '@carbon/react';
import { useConfig } from '@openmrs/esm-framework';
import type { EmarConfig } from '../config-schema';

/** Permanent notice while records are not digitally signed (configurable: showUnsignedNotice). */
export const UnsignedNotice: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useTranslation();
  const { showUnsignedNotice } = useConfig<EmarConfig>();
  if (!showUnsignedNotice) {
    return null;
  }
  return (
    <InlineNotification
      className={className}
      kind="info"
      lowContrast
      hideCloseButton
      title={t('unsignedNoticeTitle', 'Record without digital signature')}
      subtitle={t('unsignedNoticeSubtitle', 'Computerized health record: records are not digitally signed yet.')}
    />
  );
};
