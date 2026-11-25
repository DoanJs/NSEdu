import { httpsCallable, type Functions } from "firebase/functions";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

export type PasskeyStatus = { registered: boolean };

export type SiteId = "cs1";
export type Shift = "morning" | "afternoon";
export type Action = "checkIn" | "checkOut";
export type Geo = { latitude: number; longitude: number; accuracy: number };
export type FinishResult = {
  attendanceId: string;
  recordedAt: string;
  evidencePath?: string;
};
export function createAttendanceAdapter(functions: Functions) {
  const call = async <TInput, TOutput>(
    name: string,
    payload: TInput,
  ): Promise<TOutput> => {
    const { data } = await httpsCallable<TInput, TOutput>(
      functions,
      name,
    )(payload);
    return data;
  };
  return {
    async passkeyStatus(): Promise<PasskeyStatus> {
      return call<Record<string, never>, PasskeyStatus>(
        "getAttendancePasskeyStatus",
        {},
      );
    },
    async registerPasskey(): Promise<void> {
      // Registration options and verification must be generated/verified on server.
      const options = await call<
        Record<string, never>,
        Parameters<typeof startRegistration>[0]["optionsJSON"]
      >("getPasskeyRegistrationOptions", {});
      const response = await startRegistration({ optionsJSON: options });
      const result = await call<typeof response, { verified: boolean }>(
        "verifyPasskeyRegistration",
        response,
      );
      if (!result?.verified)
        throw new Error("Máy chủ không xác nhận đăng ký Passkey.");
    },
    async verifyAttendancePasskey(sessionId: string): Promise<void> {
      const options = await call<
        { sessionId: string },
        Parameters<typeof startAuthentication>[0]["optionsJSON"]
      >("getAttendancePasskeyOptions", { sessionId });
      const response = await startAuthentication({ optionsJSON: options });
      const result = await call<
        { sessionId: string; response: typeof response },
        { verified: boolean }
      >("verifyAttendancePasskey", { sessionId, response });
      if (!result?.verified)
        throw new Error("Passkey không hợp lệ hoặc đã hết hạn.");
    },
    async start(args: {
      siteId: SiteId;
      shift: Shift;
      action: Action;
      location: Geo;
    }) {
      const { data } = await httpsCallable<
        {
          siteId: SiteId;
          shift: Shift;
          action: Action;
          location: { lat: number; lng: number; accuracy: number };
        },
        { sessionId: string; expiresAt?: number; siteName?: string }
      >(
        functions,
        "startFaceAttendance",
      )({
        siteId: args.siteId,
        shift: args.shift,
        action: args.action,
        location: {
          lat: args.location.latitude,
          lng: args.location.longitude,
          accuracy: args.location.accuracy,
        },
      });
      if (!data?.sessionId) throw new Error("Không tạo được phiên xác thực.");
      return data;
    },
    async finish(args: {
      sessionId: string;
      location: Geo;
      image: Blob;
    }): Promise<FinishResult> {
      const imageData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("Không đọc được ảnh."));
        reader.onerror = () => reject(new Error("Không đọc được ảnh."));
        reader.readAsDataURL(args.image);
      });
      const { data } = await httpsCallable<
        {
          sessionId: string;
          imageData: string;
          location: { lat: number; lng: number; accuracy: number };
        },
        FinishResult
      >(
        functions,
        "finishFaceAttendance",
      )({
        sessionId: args.sessionId,
        imageData,
        location: {
          lat: args.location.latitude,
          lng: args.location.longitude,
          accuracy: args.location.accuracy,
        },
      });
      if (!data?.attendanceId || !data.recordedAt)
        throw new Error("Máy chủ chưa xác nhận chấm công.");
      return data;
    },
  };
}
