//このファイル名はsrc/app/models/model.tsです。


export interface Employee {
  // 数値型（1, 2...）でも文字列型（"E001", "1"...）でも受け取れるように許容
  id: string | number;

  salesAbility: number;
  managementAbility: number;
  developmentAbility: number;
  trainingAbility: number;

  personnelCost: number;

  department?: 'A' | 'B' | 'C' | '';
}