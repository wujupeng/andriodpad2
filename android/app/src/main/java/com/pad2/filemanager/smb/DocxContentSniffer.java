package com.pad2.filemanager.smb;

import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.zip.ZipFile;

public class DocxContentSniffer {

    private static final String TAG = "DocxContentSniffer";
    private static final byte[] ZIP_MAGIC = {0x50, 0x4B, 0x03, 0x04};
    private static final String CONTENT_TYPES_ENTRY = "[Content_Types].xml";

    public static SniffResult sniff(File file) {
        if (file == null || !file.exists()) {
            return new SniffResult(SniffResult.SniffStatus.CORRUPTED, "File is null or does not exist");
        }

        if (file.length() < 4) {
            return new SniffResult(SniffResult.SniffStatus.CORRUPTED, "File too small to be a valid ZIP/OOXML");
        }

        byte[] header = new byte[4];
        try (FileInputStream fis = new FileInputStream(file)) {
            int read = fis.read(header);
            if (read < 4) {
                return new SniffResult(SniffResult.SniffStatus.CORRUPTED, "Could not read 4-byte header");
            }
        } catch (IOException e) {
            Log.e(TAG, "Failed to read file header: " + file.getAbsolutePath(), e);
            return new SniffResult(SniffResult.SniffStatus.CORRUPTED, "IO error reading header: " + e.getMessage());
        }

        boolean isZip = true;
        for (int i = 0; i < 4; i++) {
            if (header[i] != ZIP_MAGIC[i]) {
                isZip = false;
                break;
            }
        }

        if (!isZip) {
            return new SniffResult(SniffResult.SniffStatus.CORRUPTED, "Not a ZIP file (missing PK magic number)");
        }

        try (ZipFile zipFile = new ZipFile(file)) {
            if (zipFile.getEntry(CONTENT_TYPES_ENTRY) != null) {
                Log.i(TAG, "Valid OOXML: " + file.getName() + " (has [Content_Types].xml)");
                return new SniffResult(SniffResult.SniffStatus.VALID, "Valid Word 2007+ document (ZIP + [Content_Types].xml)");
            } else {
                Log.w(TAG, "ZIP but not OOXML: " + file.getName() + " (missing [Content_Types].xml)");
                return new SniffResult(SniffResult.SniffStatus.INVALID, "Valid ZIP but missing [Content_Types].xml — not an OOXML document");
            }
        } catch (IOException e) {
            Log.e(TAG, "ZIP open failed: " + file.getAbsolutePath(), e);
            return new SniffResult(SniffResult.SniffStatus.CORRUPTED, "ZIP open failed: " + e.getMessage());
        }
    }
}