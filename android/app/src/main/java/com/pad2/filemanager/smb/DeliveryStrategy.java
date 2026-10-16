package com.pad2.filemanager.smb;

public class DeliveryStrategy {

    public enum UriScheme {
        FILE_URI_FIRST,
        CONTENT_URI_FIRST,
        REJECT_DELIVERY
    }

    private final UriScheme uriScheme;
    private final String mimeType;
    private final String intentAction;

    public DeliveryStrategy(UriScheme uriScheme, String mimeType, String intentAction) {
        this.uriScheme = uriScheme;
        this.mimeType = mimeType;
        this.intentAction = intentAction;
    }

    public UriScheme getUriScheme() { return uriScheme; }
    public String getMimeType() { return mimeType; }
    public String getIntentAction() { return intentAction; }

    @Override
    public String toString() {
        return "DeliveryStrategy{uriScheme=" + uriScheme + ", mimeType='" + mimeType + "', intentAction='" + intentAction + "'}";
    }
}