import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase.config";

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result as string);
    };

    reader.onerror = () => {
      reject(new Error("Không thể đọc file ảnh"));
    };

    reader.readAsDataURL(file);
  });
};

export const uploadTeacherAvatar = async (file: File, teacherId: string) => {
  if (!file) {
    throw new Error("Vui lòng chọn ảnh");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("File phải là hình ảnh");
  }

  const maxSize = 10 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error("Ảnh không được vượt quá 3MB");
  }

  const imageBase64 = await fileToBase64(file);

  const uploadAvatarFn = httpsCallable(functions, "uploadTeacherAvatar");

  const res: any = await uploadAvatarFn({
    teacherId,
    imageBase64,
  });

  return res.data as {
    success: boolean;
    teacherId: string;
    avatar: string;
  };
};
export const uploadChildAvatar = async (file: File, childId: string) => {
  if (!file) {
    throw new Error("Vui lòng chọn ảnh");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("File phải là hình ảnh");
  }

  const maxSize = 10 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error("Ảnh không được vượt quá 3MB");
  }

  const imageBase64 = await fileToBase64(file);

  const uploadAvatarFn = httpsCallable(functions, "uploadChildAvatar");

  const res: any = await uploadAvatarFn({
    childId,
    imageBase64,
  });

  return res.data as {
    success: boolean;
    childId: string;
    avatar: string;
  };
};

export const uploadViolationImages = async (files: File[]) => {
  if (files.length === 0) {
    throw new Error("Vui lòng chọn hình ảnh");
  }

  const maxSize = 3 * 1024 * 1024;

  files.forEach((file) => {
    if (!file.type.startsWith("image/")) {
      throw new Error(`${file.name} không phải là hình ảnh`);
    }

    if (file.size > maxSize) {
      throw new Error(`${file.name} vượt quá 3MB`);
    }
  });

  const imageBase64s = await Promise.all(
    files.map((file) => fileToBase64(file)),
  );

  const uploadFn = httpsCallable<
    { imageBase64s: string[] },
    { success: boolean; urls: string[] }
  >(functions, "uploadViolationImages");

  const res = await uploadFn({
    imageBase64s,
  });

  return res.data;
};