import { registerPlugin } from '@capacitor/core';
import type { UpdatePluginInterface } from './types';

const UpdatePlugin = registerPlugin<UpdatePluginInterface>('UpdatePlugin');

export default UpdatePlugin;
export type { UpdatePluginInterface } from './types';
export type { UpdateManifest, UpdateStatus, UpdateErrorCategory, UpdateInfo, CurrentVersion, DownloadProgress, DownloadProgressEvent } from './types';