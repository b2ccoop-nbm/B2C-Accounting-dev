import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { FirebaseSessionDto } from "./dto/firebase-session.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Staff UI: exchange Firebase ID token for accounting staff JWT */
  @Post("firebase/session")
  firebaseSession(@Body() dto: FirebaseSessionDto) {
    return this.auth.exchangeFirebaseSession(dto.idToken);
  }
}
