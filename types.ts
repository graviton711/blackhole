export interface BlackHoleParams {
  mass: number;          // Solar masses (affects size)
  spin: number;          // 0 to 1 (affects swirl speed)
  temperature: number;   // Kelvin (affects color)
  accretionDensity: number; // 0 to 1 (affects disk opacity/brightness)
}

export interface AnalysisResult {
  text: string;
  loading: boolean;
  error: string | null;
}
