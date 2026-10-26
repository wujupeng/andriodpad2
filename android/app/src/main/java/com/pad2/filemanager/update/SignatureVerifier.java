package com.pad2.filemanager.update;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.util.Log;

import java.security.MessageDigest;

public class SignatureVerifier {
    private static final String TAG = "SignatureVerifier";

    public static String getInstalledSignatureSha256(Context context, String packageName) {
        try {
            PackageManager pm = context.getPackageManager();
            PackageInfo info = pm.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES);
            SigningInfo signingInfo = info.signingInfo;
            if (signingInfo == null) return null;
            Signature[] sigs = signingInfo.hasMultipleSigners()
                ? signingInfo.getApkContentsSigners()
                : signingInfo.getSigningCertificateHistory();
            if (sigs.length == 0) return null;
            return signatureToSha256(sigs[0]);
        } catch (Exception e) {
            Log.e(TAG, "getInstalledSignatureSha256 failed: " + e.getMessage());
            return null;
        }
    }

    public static String getApkSignatureSha256(Context context, String apkPath) {
        try {
            PackageManager pm = context.getPackageManager();
            PackageInfo info = pm.getPackageArchiveInfo(apkPath, PackageManager.GET_SIGNING_CERTIFICATES);
            if (info == null || info.signingInfo == null) return null;
            Signature[] sigs = info.signingInfo.hasMultipleSigners()
                ? info.signingInfo.getApkContentsSigners()
                : info.signingInfo.getSigningCertificateHistory();
            if (sigs.length == 0) return null;
            return signatureToSha256(sigs[0]);
        } catch (Exception e) {
            Log.e(TAG, "getApkSignatureSha256 failed: " + e.getMessage());
            return null;
        }
    }

    public static boolean verify(Context context, String packageName, String apkPath) {
        String installed = getInstalledSignatureSha256(context, packageName);
        String apk = getApkSignatureSha256(context, apkPath);
        if (installed == null || apk == null) return false;
        return installed.equals(apk);
    }

    private static String signatureToSha256(Signature sig) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] digest = md.digest(sig.toByteArray());
        StringBuilder sb = new StringBuilder();
        for (byte b : digest) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}