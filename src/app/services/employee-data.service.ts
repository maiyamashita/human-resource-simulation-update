import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';

@Injectable({
  providedIn: 'root'
})
export class EmployeeDataService {

  private employees: Employee[] = [];

  setEmployees(employees: Employee[]): void {
    this.employees = employees;
  }

  getEmployees(): Employee[] {
    return this.employees;
  }

  clear(): void {
    this.employees = [];
  }

  readCsv(file: File): Promise<Employee[]> {
    return new Promise((resolve, reject) => {

      const reader = new FileReader();

      reader.onload = () => {
        try {
          const text = reader.result as string;
          const employees = this.parseCsv(text);
          this.setEmployees(employees);
          resolve(employees);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(
          new Error('CSVファイルの読み込みに失敗しました。')
        );
      };

      reader.readAsText(file, 'UTF-8');
    });
  }

  private parseCsv(text: string): Employee[] {

    const lines = text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter(line => line.trim() !== '');

    if (lines.length < 2) {
      throw new Error('CSVに社員データがありません。');
    }

    const headers = this.parseCsvLine(lines[0]);

    const requiredHeaders = [
      '社員番号',
      '営業力',
      '管理力',
      '開拓力',
      '育成力',
      '人件費'
    ];

    for (const header of requiredHeaders) {
      if (!headers.includes(header)) {
        throw new Error(
          `CSVに「${header}」列がありません。`
        );
      }
    }

    const employees: Employee[] = [];

    for (let i = 1; i < lines.length; i++) {

      const values = this.parseCsvLine(lines[i]);

      if (values.length < headers.length) {
        continue;
      }

      const row: Record<string, string> = {};

      headers.forEach((header, index) => {
        row[header] = values[index]?.trim() ?? '';
      });

      const employee: Employee = {
        id: row['社員番号'],

        salesAbility: this.toNumber(
          row['営業力']
        ),

        managementAbility: this.toNumber(
          row['管理力']
        ),

        developmentAbility: this.toNumber(
          row['開拓力']
        ),

        trainingAbility: this.toNumber(
          row['育成力']
        ),

        personnelCost: this.toNumber(
          row['人件費']
        )
      };

      this.validateEmployee(employee, i + 1);

      employees.push(employee);
    }

    if (employees.length === 0) {
      throw new Error('有効な社員データがありません。');
    }

    return employees;
  }

  private validateEmployee(
    employee: Employee,
    rowNumber: number
  ): void {

    if (!employee.id) {
      throw new Error(
        `${rowNumber}行目：社員番号がありません。`
      );
    }

    // 能力値の数値チェック（負の数のみガード）
    const abilities = [
      employee.salesAbility,
      employee.managementAbility,
      employee.developmentAbility,
      employee.trainingAbility
    ];

    for (const value of abilities) {
      if (value < 0) {
        throw new Error(
          `${rowNumber}行目：能力値に負の数が指定されています。`
        );
      }
    }

    // 人件費の数値チェック（負の数のみガード）
    if (employee.personnelCost < 0) {
      throw new Error(
        `${rowNumber}行目：人件費に負の数が指定されています。`
      );
    }
  }

  private toNumber(value: string): number {

    const number = Number(
      value.replace(/,/g, '')
    );

    if (!Number.isFinite(number)) {
      throw new Error(
        `数値として読み込めない値があります：${value}`
      );
    }

    return number;
  }

  private parseCsvLine(line: string): string[] {

    const result: string[] = [];

    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {

      const char = line[i];

      if (char === '"') {

        if (
          insideQuotes &&
          line[i + 1] === '"'
        ) {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }

      } else if (
        char === ',' &&
        !insideQuotes
      ) {

        result.push(current);
        current = '';

      } else {

        current += char;

      }
    }

    result.push(current);

    return result;
  }
}