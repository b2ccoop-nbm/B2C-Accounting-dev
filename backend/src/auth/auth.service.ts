import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { StaffRole } from "@prisma/client";
import * as admin from "firebase-admin";
import { PrismaService } from "../prisma/prisma.service";
import type { StaffJwtRole } from "./staff-jwt.guard";

export type StaffSessionResponse = {
  accessToken: string;
  expiresIn: string;
  role: StaffJwtRole;
  email: string;
};

function staffRoleToJwt(role: StaffRole): StaffJwtRole {
  switch (role) {
    case StaffRole.SUPERUSER:
      return "superuser";
    case StaffRole.TREASURER:
      return "treasurer";
    case StaffRole.ADMIN:
    default:
      return "admin";
  }
}

@Injectable()
export class AuthService {
  private firebaseAdminApp: admin.app.App | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private getFirebaseAdminApp(): admin.app.App | null {
    if (this.firebaseAdminApp) return this.firebaseAdminApp;
    const projectId = String(this.config.get<string>("FIREBASE_PROJECT_ID") ?? "").trim();
    const clientEmail = String(this.config.get<string>("FIREBASE_CLIENT_EMAIL") ?? "").trim();
    let privateKey = String(this.config.get<string>("FIREBASE_PRIVATE_KEY") ?? "").trim();
    if (!projectId || !clientEmail || !privateKey) return null;
    privateKey = privateKey.replace(/\\n/g, "\n");
    if (admin.apps.length > 0) {
      this.firebaseAdminApp = admin.apps[0] as admin.app.App;
      return this.firebaseAdminApp;
    }
    this.firebaseAdminApp = admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    return this.firebaseAdminApp;
  }

  async exchangeFirebaseSession(idToken: string): Promise<StaffSessionResponse> {
    const app = this.getFirebaseAdminApp();
    if (!app) {
      throw new UnauthorizedException(
        "Firebase Admin is not configured on the accounting API",
      );
    }
    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth(app).verifyIdToken(idToken);
    } catch {
      throw new UnauthorizedException("Invalid Firebase ID token");
    }
    const email = String(decoded.email ?? "").trim().toLowerCase();
    if (!email) {
      throw new UnauthorizedException("Firebase account has no email");
    }

    let staff = await this.prisma.staffUser.findUnique({ where: { email } });
    if (!staff) {
      throw new ForbiddenException(
        "No accounting staff record for this email — ask an admin to add you in StaffUser",
      );
    }
    if (decoded.uid && staff.firebaseUid !== decoded.uid) {
      staff = await this.prisma.staffUser.update({
        where: { id: staff.id },
        data: { firebaseUid: decoded.uid },
      });
    }

    const role = staffRoleToJwt(staff.role);
    const allowed: StaffJwtRole[] = ["superuser", "admin", "treasurer"];
    if (!allowed.includes(role)) {
      throw new ForbiddenException("Role not permitted for accounting");
    }

    const accessToken = await this.jwt.signAsync(
      { sub: staff.id, role },
      { expiresIn: "8h" },
    );
    return { accessToken, expiresIn: "8h", role, email };
  }
}
