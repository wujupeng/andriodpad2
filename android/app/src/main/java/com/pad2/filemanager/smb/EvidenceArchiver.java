package com.pad2.filemanager.smb;

import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.regex.Pattern;

public class EvidenceArchiver {

    private static final String TAG = "EvidenceArchiver";
    private static final Pattern PASSWORD_PATTERN = Pattern.compile("(password|passwd|pwd|secret|token)\\s*[=:]\\s*\\S+", Pattern.CASE_INSENSITIVE);
    private static final String[] WPS_PACKAGES = {"cn.wps.moffice_eng", "cn.wps.moffice", "com.tencent.wps"};

    private final Context context;

    public EvidenceArchiver(Context context) {
        this.context = context;
    }

    public EvidencePackage archive(TestReport testReport, String codeSha) {
        EvidencePackage pkg = new EvidencePackage();

        pkg.setApkVersion(collectApkVersion());
        pkg.setCodeSha(codeSha != null ? codeSha : collectCodeSha());
        pkg.setDeviceInfo(collectDeviceInfo());

        for (ScenarioResult sr : testReport.getScenarioResults()) {
            pkg.getTestSteps().add(String.format("[%s] %s — %s",
                    sr.isPassed() ? "PASS" : "FAIL",
                    sr.getScenarioName(),
                    sr.getEvidence()));
        }

        pkg.getSanitizedLogs().add(sanitize("Environment: " + testReport.getEnvironment()));
        pkg.getSanitizedLogs().add(sanitize("All passed: " + testReport.isAllPassed()));

        Log.i(TAG, "Evidence archived: apkVersion=" + pkg.getApkVersion() +
                ", codeSha=" + pkg.getCodeSha() +
                ", device=" + pkg.getDeviceInfo().getModel());
        return pkg;
    }

    private String collectApkVersion() {
        try {
            String versionName = context.getPackageManager()
                    .getPackageInfo(context.getPackageName(), 0).versionName;
            int versionCode = context.getPackageManager()
                    .getPackageInfo(context.getPackageName(), 0).versionCode;
            return versionName + " (" + versionCode + ")";
        } catch (PackageManager.NameNotFoundException e) {
            return "unknown";
        }
    }

    private String collectCodeSha() {
        try {
            Process p = Runtime.getRuntime().exec(new String[]{"git", "rev-parse", "HEAD"});
            BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()));
            String sha = reader.readLine();
            reader.close();
            p.waitFor();
            return sha != null ? sha : "unknown";
        } catch (Exception e) {
            return "unknown";
        }
    }

    private DeviceInfo collectDeviceInfo() {
        String model = Build.MODEL;
        String androidVersion = Build.VERSION.RELEASE;
        int apiLevel = Build.VERSION.SDK_INT;

        String wpsPkg = null;
        String wpsVer = null;
        PackageManager pm = context.getPackageManager();
        for (String pkg : WPS_PACKAGES) {
            try {
                pm.getPackageInfo(pkg, 0);
                wpsPkg = pkg;
                wpsVer = pm.getPackageInfo(pkg, 0).versionName;
                break;
            } catch (PackageManager.NameNotFoundException e) {
                // continue
            }
        }

        return new DeviceInfo(model, androidVersion, apiLevel, wpsPkg, wpsVer);
    }

    public static String sanitize(String log) {
        return PASSWORD_PATTERN.matcher(log).replaceAll("$1=***");
    }
}