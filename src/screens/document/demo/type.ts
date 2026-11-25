export interface DocumentUploadUrlResponse {
  files: {
    key: string;
    uploadUrl: string;
    extension: string;
    contentType: string;
    expiresIn: number;
  }[];
}
