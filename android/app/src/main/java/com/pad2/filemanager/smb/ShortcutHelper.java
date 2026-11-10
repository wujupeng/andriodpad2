package com.pad2.filemanager.smb;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.Log;

import java.util.Collections;

public class ShortcutHelper {
    private static final String TAG = "ShortcutHelper";
    private static final int MAX_SHORTCUTS = 4;

    public static boolean createShortcut(Context context, String id, String label, String profileId, String path) {
        return createShortcutWithSource(context, id, label, profileId, path, "smb");
    }

    public static boolean createShortcutWithSource(Context context, String id, String label, String profileId, String path, String sourceType) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) {
            Log.w(TAG, "ShortcutManager not available on API < 25, sourceType=" + sourceType);
            return false;
        }

        ShortcutManager shortcutManager = (ShortcutManager) context.getSystemService(Context.SHORTCUT_SERVICE);
        if (shortcutManager == null) {
            Log.e(TAG, "ShortcutManager is null");
            return false;
        }

        if (shortcutManager.getDynamicShortcuts().size() >= MAX_SHORTCUTS) {
            Log.w(TAG, "Max dynamic shortcuts reached (" + MAX_SHORTCUTS + ")");
            return false;
        }

        Intent intent = new Intent(context, com.pad2.filemanager.MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.putExtra("shortcut_profile_id", profileId);
        intent.putExtra("shortcut_path", path);
        intent.putExtra("shortcut_source_type", sourceType);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        ShortcutInfo.Builder builder = new ShortcutInfo.Builder(context, id)
                .setShortLabel(label)
                .setLongLabel(label)
                .setIntent(intent);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder.setIcon(Icon.createWithResource(context, android.R.drawable.ic_menu_view));
        }

        ShortcutInfo shortcut = builder.build();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                shortcutManager.requestPinShortcut(shortcut, null);
                Log.i(TAG, "Pin shortcut requested: " + id + " label=" + label + " sourceType=" + sourceType);
                return true;
            } else {
                Log.w(TAG, "requestPinShortcut not available on API < 26, sourceType=" + sourceType);
                return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to create shortcut: " + e.getMessage());
            return false;
        }
    }

    public static boolean removeShortcut(Context context, String id) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) {
            return false;
        }

        ShortcutManager shortcutManager = (ShortcutManager) context.getSystemService(Context.SHORTCUT_SERVICE);
        if (shortcutManager == null) {
            return false;
        }

        try {
            shortcutManager.removeDynamicShortcuts(Collections.singletonList(id));
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to remove shortcut: " + e.getMessage());
            return false;
        }
    }

    public static boolean isAvailable(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return false;
        }
        ShortcutManager shortcutManager = (ShortcutManager) context.getSystemService(Context.SHORTCUT_SERVICE);
        return shortcutManager != null && shortcutManager.isRateLimitingActive() == false;
    }
}