package com.pad2.filemanager.smb;

import android.util.Log;

public class DeliveryStrategySelector {

    private static final String TAG = "DeliveryStrategySelector";
    private static final String DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    public static DeliveryStrategy selectStrategy(String fileType, SniffResult sniffResult) {
        if (fileType == null) {
            return new DeliveryStrategy(DeliveryStrategy.UriScheme.FILE_URI_FIRST, "*/*", "ACTION_EDIT");
        }

        String lowerType = fileType.toLowerCase();

        if ("docx".equals(lowerType)) {
            if (sniffResult != null && sniffResult.getStatus() == SniffResult.SniffStatus.VALID) {
                Log.i(TAG, "docx + VALID sniff → FILE_URI_FIRST + ACTION_VIEW");
                return new DeliveryStrategy(DeliveryStrategy.UriScheme.FILE_URI_FIRST, DOCX_MIME, "ACTION_VIEW");
            } else {
                String detail = sniffResult != null ? sniffResult.getDetail() : "sniff result is null";
                Log.w(TAG, "docx + invalid sniff → REJECT_DELIVERY: " + detail);
                return new DeliveryStrategy(DeliveryStrategy.UriScheme.REJECT_DELIVERY, DOCX_MIME, "ACTION_EDIT");
            }
        }

        String mimeType = FileAppResolver.getMimeType("test." + lowerType);
        Log.i(TAG, lowerType + " → FILE_URI_FIRST (default)");
        return new DeliveryStrategy(DeliveryStrategy.UriScheme.FILE_URI_FIRST, mimeType, "ACTION_EDIT");
    }
}