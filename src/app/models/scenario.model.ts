export interface DepartmentResult {
  count: number;
  ability: number;
  sales: number;
  profit: number;
}

export interface Scenario {
  id: number;
  name: string;
  shortName: string;
  objective: string;
  objectiveValue: number;
  totalSales: number;
  totalProfit: number;

  departments: {
    A: DepartmentResult;
    B: DepartmentResult;
    C: DepartmentResult;
  };
  assignment: {
    A: string[];
    B: string[];
    C: string[];
  };
}

export type Department = 'A' | 'B' | 'C';