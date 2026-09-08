// src/app/components/employee-notice/employee-notice.component.ts

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges
} from '@angular/core';

import { CommonModule } from '@angular/common';

import {
  Scenario,
  Department,
  Employee
} from '../../models/scenario.model';


@Component({
  selector: 'app-employee-notice',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './employee-notice.component.html',
  styleUrl: './employee-notice.component.css'
})
export class EmployeeNoticeComponent implements OnChanges {

  /* ==================================================
     入力
  ================================================== */

  @Input() employee: Employee | null = null;

  @Input() scenario: Scenario | null = null;

  @Input() assignedDepartment: Department = 'A';


  /* ==================================================
     出力
  ================================================== */

  @Output() close = new EventEmitter<void>();

  @Output() navigateEmployee =
    new EventEmitter<'prev' | 'next'>();


  /* ==================================================
     配属理由データ
  ================================================== */

  rationaleData: {
    headline: string;
    reasonText: string;
    matchedPreference: boolean;
    preferenceLabel: string;
  } | null = null;


  /* ==================================================
     ライフサイクル
  ================================================== */

  ngOnChanges(changes: SimpleChanges): void {

    /*
     * 社員・シナリオ・配属先のいずれかが変更された場合、
     * 通知書の理由表示を再計算する。
     */
    if (
      changes['employee'] ||
      changes['scenario'] ||
      changes['assignedDepartment']
    ) {
      this.updateRationale();
    }
  }


  /* ==================================================
     社員名表示
  ================================================== */

  /**
   * 通知書の宛名表示。
   *
   * 氏名が存在する場合：
   *   山田太郎 殿
   *
   * 氏名が存在しない場合：
   *   社員番号 #E001 殿
   */
  get employeeDisplayName(): string {

    if (!this.employee) {
      return '';
    }

    return this.employee.name
      ? `${this.employee.name} 殿`
      : `社員番号 #${this.employee.id} 殿`;
  }


  /* ==================================================
     配属理由生成
  ================================================== */

  private updateRationale(): void {

    /*
     * 社員またはシナリオが存在しない場合は、
     * 理由データをクリアする。
     */
    if (!this.employee || !this.scenario) {

      this.rationaleData = null;

      return;
    }


    /*
     * Employeeモデルに存在する可能性のある
     * バックエンド由来のフィールドも扱うため、
     * ここでは一時的にanyへ変換する。
     */
    const emp = this.employee as any;

    const assignedDept = this.assignedDepartment;


    /* ==================================================
       希望部署
    ================================================== */

    const desired =
      emp.desiredDepartment ??
      emp.preferred_dept ??
      'A';

    const secondDesired =
      emp.secondDesiredDepartment ??
      emp.second_preferred_dept ??
      null;


    const isFirstChoice =
      assignedDept === desired;

    const isSecondChoice =
      assignedDept === secondDesired;


    /* ==================================================
       能力値
    ================================================== */

    const sales =
      Number(
        emp.salesAbility ??
        emp.sales ??
        60
      );

    const mgmt =
      Number(
        emp.managementAbility ??
        emp.management ??
        60
      );

    const dev =
      Number(
        emp.developmentAbility ??
        emp.development ??
        60
      );

    const train =
      Number(
        emp.trainingAbility ??
        emp.training ??
        60
      );


    /* ==================================================
       最高能力を取得
    ================================================== */

    const abilities = [
      {
        key: '営業力',
        value: sales
      },
      {
        key: '管理力',
        value: mgmt
      },
      {
        key: '開拓力',
        value: dev
      },
      {
        key: '育成力',
        value: train
      }
    ];


    abilities.sort(
      (a, b) => b.value - a.value
    );


    const topAbility = abilities[0];


    /* ==================================================
       配属理由
    ================================================== */

    let headline = '';

    let reasonText = '';

    let preferenceLabel = '経営戦略配置';


    /* --------------------------------------------------
       第1希望
    -------------------------------------------------- */

    if (isFirstChoice) {

      preferenceLabel = '第1希望合致';

      headline =
        `ご自身の強い意向と高い【${topAbility.key} (${topAbility.value}pt)】が高く評価されました`;

      reasonText =
        `ご提出いただいた配属希望（第1希望）に沿った配置です。` +
        `特にご自身の強みである${topAbility.key}は、` +
        `${this.departmentInfo.name}の目標達成において` +
        `不可欠なコア能力として選定されました。`;
    }


    /* --------------------------------------------------
       第2希望
    -------------------------------------------------- */

    else if (isSecondChoice) {

      preferenceLabel = '第2希望合致';

      headline =
        `配属希望および【${topAbility.key} (${topAbility.value}pt)】の専門性を考慮した配置です`;

      reasonText =
        `第2希望の事業部への配属となります。` +
        `持ち味である${topAbility.key}を遺憾なく発揮いただき、` +
        `${this.departmentInfo.name}のミッション推進を期待しています。`;
    }


    /* --------------------------------------------------
       戦略配置
    -------------------------------------------------- */

    else {

      preferenceLabel = '全社重点配置';

      headline =
        `経営戦略上の重要拠点である【${assignedDept}事業部】への抜擢配置です`;

      reasonText =
        `今期の経営方針「${this.scenario.name}」の推進にあたり、` +
        `優れた【${topAbility.key} (${topAbility.value}pt)】が` +
        `${this.departmentInfo.name}の課題解決に強く求められたため、` +
        `戦略的抜擢を行いました。`;
    }


    /* ==================================================
       結果を保存
    ================================================== */

    this.rationaleData = {

      headline,

      reasonText,

      matchedPreference:
        isFirstChoice || isSecondChoice,

      preferenceLabel
    };
  }


  /* ==================================================
     配属先情報
  ================================================== */

  get departmentInfo(): {
    name: string;
    mission: string;
  } {

    switch (this.assignedDepartment) {

      case 'A':

        return {
          name: 'A事業部',
          mission:
            '既存収益基盤の維持・組織運営の最大効率化'
        };


      case 'B':

        return {
          name: 'B事業部',
          mission:
            '営業力の集中的発揮とスケールメリットによる売上拡大'
        };


      case 'C':

        return {
          name: 'C事業部',
          mission:
            '高い開拓力を活かした新市場創出と将来成長の牽引'
        };


      default:

        return {
          name: '未定',
          mission: ''
        };
    }
  }


  /* ==================================================
     発令年月日
  ================================================== */

  get issueDate(): string {

    const today = new Date();

    return (
      `${today.getFullYear()}年` +
      `${today.getMonth() + 1}月` +
      `${today.getDate()}日`
    );
  }


  /* ==================================================
     印刷
  ================================================== */

  printNotice(): void {

    /*
     * 印刷対象の制御は @media print のCSSで行う。
     *
     * ここではブラウザ標準の印刷ダイアログを
     * 呼び出すだけにする。
     */
    window.print();
  }


  /* ==================================================
     モーダルを閉じる
  ================================================== */

  onClose(): void {

    this.close.emit();
  }


  /* ==================================================
     前の社員
  ================================================== */

  onPrev(): void {

    this.navigateEmployee.emit('prev');
  }


  /* ==================================================
     次の社員
  ================================================== */

  onNext(): void {

    this.navigateEmployee.emit('next');
  }
}