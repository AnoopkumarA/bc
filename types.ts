
export interface ResumeContext {
  jobTitle: string;
  company: string;
  resumeText: string;
  jobDescription: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
  isFinal?: boolean;
}

export interface ResponseSegment {
  id: string;
  role: 'user' | 'model';
  text: string;
  isComplete: boolean;
}

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export enum AnswerLength {
  SHORT = 'SHORT',
  MEDIUM = 'MEDIUM',
  LONG = 'LONG',
}

// Native Electron Bridge Types
export interface ElectronAPI {
  toggleStealthMode: (enable: boolean) => Promise<boolean>;
  isStealthSupported: () => Promise<boolean>;
  resizeWindow: (width: number, height: number) => Promise<void>;
  env?: {
    API_KEY?: string;
  };
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}