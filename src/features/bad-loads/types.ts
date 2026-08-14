export interface DispenserOption {
  id: string;
  code: string;
  terminal_name: string;
  terminal_code: string;
  active: boolean;
}

export interface BadLoadTodaySummary {
  dispenser_id: string;
  dispenser_code: string;
  terminal_name: string;
  terminal_code: string;
  liters: number;
}
