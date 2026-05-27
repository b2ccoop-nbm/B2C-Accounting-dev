import { IsNotEmpty, IsString } from "class-validator";

export class FirebaseSessionDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}
