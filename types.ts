export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
}

export interface AudioVolumeState {
  inputVolume: number; // 0.0 to 1.0
  outputVolume: number; // 0.0 to 1.0
}

export interface LiveSessionState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

export type AudioConfig = {
  voiceName: VoiceName;
};
