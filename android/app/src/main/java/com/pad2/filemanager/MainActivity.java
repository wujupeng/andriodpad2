package com.pad2.filemanager;

import android.os.Bundle;
import android.os.StrictMode;

import com.getcapacitor.BridgeActivity;
import com.pad2.filemanager.smb.SmbPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        StrictMode.setVmPolicy(new StrictMode.VmPolicy.Builder().build());
        registerPlugin(SmbPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
