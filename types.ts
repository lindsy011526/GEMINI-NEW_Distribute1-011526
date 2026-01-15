export interface PackingListItem {
  Suppliername: string;
  deliverdate: string; // Raw string
  deliverdate_dt: Date | null;
  customer: string;
  licenseID: string;
  DeviceCategory: string;
  UDI: string;
  DeviceName: string;
  LotNumber: string;
  SN: string;
  ModelNum: string;
  Numbers: number;
  Unit: string;
  [key: string]: any;
}

export interface PainterStyle {
  id: string;
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    bg: string;
    text: string;
    card: string;
  };
  description: string;
}

export type Language = 'en' | 'zh';

export type AppTab = 'chat' | 'analytics' | 'hq' | 'docs';

export interface AgentDef {
  id: string;
  name?: string; // Derived from key
  description: string;
  llm_provider: string;
  model: string;
  capabilities: string[];
  system_prompt: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  agentId?: string;
  modelUsed?: string;
}

export interface UsageLog {
  timestamp: number;
  event: string;
  details: string;
}

export interface DataFilters {
  supplier: string;
  device: string;
  startDate: string;
  endDate: string;
}