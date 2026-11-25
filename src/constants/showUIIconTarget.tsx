export const showUIIconTarget = (title: string) => {
  let result: any;
  switch (title) {
    case "Tiền ngôn ngữ":
      result = "tngngu.png";
      break;
    case "Nhận thức":
      result = "nt.png";
      break;
    case "Ngôn ngữ hiểu":
      result = "nnh.png";
      break;
    case "Ngôn ngữ diễn đạt":
      result = "nndd.png";
      break;
    case "Vận động thô":
      result = "vdtho.png";
      break;
    case "Vận động tinh":
      result = "vdt.png";
      break;
    case "Kỹ năng chơi":
      result = "knc.png";
      break;
    case "Phát âm":
      result = "pa.png";
      break;
    case "Hành vi":
      result = "hv.png";
      break;
    case "Tiền học đường":
      result = "thdg.png";
      break;
    case "Kỹ năng xã hội":
      result = "knxh.png";
      break;
    case "Giác quan":
      result = "gq.png";
      break;
    case "ABLLS":
      result = "ablls.png";
      break;
    case "Toán":
      result = "toan.png";
      break;
    case "Tiếng Việt":
      result = "tiengviet.png";
      break;

    default:
      result = "NSXEdu-icon-192x192.png"; //Kỹ năng xã hội
      break;
  }
  return result;
};
