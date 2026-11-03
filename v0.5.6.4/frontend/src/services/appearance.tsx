import { createContext, useContext } from 'react';

export type LayoutMode = 'corporate' | 'workspace';
export interface AppearanceSettings {
  layout: LayoutMode;
  theme: 'btg_light';
  login_particles: boolean;
  updated_at?: string | null;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  layout: 'corporate', theme: 'btg_light', login_particles: true,
};

export interface AppearanceStore {
  appearance: AppearanceSettings;
  saveAppearance: (next: AppearanceSettings) => Promise<void>;
}

export const AppearanceContext = createContext<AppearanceStore>({
  appearance: DEFAULT_APPEARANCE,
  saveAppearance: async () => { throw new Error('Configuração indisponível.'); },
});

export function useAppearance() { return useContext(AppearanceContext); }
