import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";
import PizZip from "pizzip";

type Score = { self?: number; manager?: number };
type Criterion = { id: string; max: number };
export type TeacherWordData = {
  teacherName: string;
  year: number;
  month: number;
  scores: Record<string, Score>;
  comment: string;
};

const format = (value: number): string =>
  Number(value.toFixed(2)).toLocaleString("vi-VN");
const grade = (score: number): string =>
  score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";

export async function exportTeacherEvaluationWord(
  data: TeacherWordData,
  criteria: readonly Criterion[],
  templateUrl = "/template_teacher_evaluation.docx",
): Promise<void> {
  if (criteria.length !== 33) {
    throw new Error(
      `Mẫu Word có 33 tiêu chí, nhưng UI có ${criteria.length} tiêu chí.`,
    );
  }
  const response = await fetch(templateUrl);
  if (!response.ok)
    throw new Error(`Không tải được mẫu Word (${response.status}).`);
  const zip = new PizZip(await response.arrayBuffer());
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  const values: Record<string, string | number> = {
    teacherName: data.teacherName,
    year: data.year,
    month: data.month,
    day: new Date().getDate(),
    comment: data.comment || "",
  };
  let maxTotal = 0;
  let selfTotal = 0;
  let managerTotal = 0;
  let deductionTotal = 0;
  let achievedTotal = 0;
  let reviewed = 0;

  criteria.forEach((criterion, i) => {
    const score = data.scores[criterion.id] || {};
    const self = score.self;
    const manager = score.manager;
    const complete = self !== undefined && manager !== undefined;
    const deduction = complete ? self - manager : undefined;
    const achieved =
      deduction !== undefined ? criterion.max - deduction : undefined;
    values[`c${i}_max`] = format(criterion.max);
    values[`c${i}_self`] = self === undefined ? "—" : format(self);
    values[`c${i}_manager`] = manager === undefined ? "—" : format(manager);
    values[`c${i}_deduction`] =
      deduction === undefined ? "—" : format(deduction);
    values[`c${i}_achieved`] = achieved === undefined ? "—" : format(achieved);
    maxTotal += criterion.max;
    selfTotal += self ?? 0;
    managerTotal += manager ?? 0;
    deductionTotal += deduction ?? 0;
    achievedTotal += achieved ?? 0;
    if (complete) reviewed++;
  });
  values.maxTotal = format(maxTotal);
  values.selfTotal = format(selfTotal);
  values.managerTotal = reviewed ? format(managerTotal) : "—";
  values.deductionTotal = reviewed ? format(deductionTotal) : "—";
  values.achievedTotal =
    reviewed === criteria.length ? format(achievedTotal) : "—";
  // values.grade =
  //   reviewed === criteria.length ? grade(achievedTotal) : "Chưa chấm đủ";
  // Xếp loại giáo viên tự đánh giá
  const selfReviewed = criteria.every(
    (criterion) => data.scores[criterion.id]?.self !== undefined,
  );

  values.selfGrade = selfReviewed ? grade(selfTotal) : "Chưa chấm đủ";

  // Xếp loại quản lý đánh giá
  values.managerGrade =
    reviewed === criteria.length ? grade(achievedTotal) : "Chưa chấm đủ";

  // Giữ tương thích với mẫu Word cũ (nếu còn dùng)
  values.grade = values.managerGrade;

  doc.render(values);
  const blob = doc.getZip().generate({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const safeName = data.teacherName.replace(/[\\/:*?"<>|]/g, "_").trim();
  saveAs(blob, `Phieu_danh_gia_${safeName}_${data.month}_${data.year}.docx`);
}
