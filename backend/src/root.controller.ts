import { Controller, Get, Redirect } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

@Controller()
@SkipThrottle()
export class RootController {
  @Get()
  @Redirect("/health", 302)
  root() {
    return;
  }
}
