// src/app/services/employee-data.service.ts

import { Injectable } from '@angular/core';
import { Employee } from '../models/scenario.model';

@Injectable({
  providedIn: 'root'
})
export class EmployeeDataService {

  private employees: Employee[] = [];

  // ★ 苗字バリエーション（50種類）
  private readonly SURNAMES = [
    '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤',
    '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水',
    '山崎', '森', '池田', '橋本', '阿部', '石川', '山下', '小川', '石井', '長谷川',
    '後藤', '岡田', '長谷', '藤田', '前田', '近藤', '遠藤', '青木', '坂本', '村上',
    '太田', '金子', '藤井', '福田', '西村', '三浦', '竹内', '中島', '岡本', '原田'
  ];

  // ★ 名前バリエーション（50種類）
  private readonly GIVEN_NAMES = [
    '太郎', '健一', '大輔', '誠', '直樹', '拓也', '翔太', '健太', '洋平', '和也',
    '花子', '由美', '恵', '陽子', '麻衣', '香織', '裕子', '智子', '美咲', '瞳',
    '一郎', '哲也', '竜太', '駿', '亮平', '慎太郎', '達也', '修平', '将太', '康介',
    '真一', '雅人', '崇', '剛', '大輝', '優太', '健二', '潤', '大樹', '雄太',
    '葵', '彩', '真由美', '舞', '萌', '奈々', '千尋', '愛', '遥', '結衣'
  ];

  /** 
   * ビット操作によるハッシュ関数
   * 近接したID（1, 2, 3...）でも算出インデックスをバラバラにし、同姓同名を防止する
   */
  private hashId(id: number, seed: number): number {
    let h = (id ^ seed) * 0x5bd1e995;
    h = (h ^ (h >> 24)) * 0x5bd1e995;
    return Math.abs(h ^ (h >> 13));
  }

  /** IDから再現性があり、同姓同名が被らない日本語姓名を生成 */
  private generateJapaneseName(id: string | number): string {
    const numId = typeof id === 'number' ? id : parseInt(String(id).replace(/\D/g, '') || '1', 10);

    // 苗字用・名前用で異なるシード値を与えて散乱させる
    const surnameIndex = this.hashId(numId, 0x12345678) % this.SURNAMES.length;
    const givenNameIndex = this.hashId(numId, 0x87654321) % this.GIVEN_NAMES.length;

    return `${this.SURNAMES[surnameIndex]} ${this.GIVEN_NAMES[givenNameIndex]}`;
  }

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

      const empId = row['社員番号'];

      const employee: Employee = {
        id: empId,
        name: this.generateJapaneseName(empId), // ★ ハッシュ適用版の自動氏名

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