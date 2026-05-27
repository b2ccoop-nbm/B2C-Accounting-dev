import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { IntegrationAuthGuard } from "../auth/integration-auth.guard";
import { StaffJwtGuard } from "../auth/staff-jwt.guard";
import { JournalEventDto } from "./dto/journal-event.dto";
import { IntegrationsService } from "./integrations.service";

@Controller("integrations/v1")
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Post("journal-events")
  @UseGuards(IntegrationAuthGuard)
  @HttpCode(200)
  async postJournalEvent(@Body() dto: JournalEventDto, @Res({ passthrough: true }) res: Response) {
    const { created, entry } = await this.integrations.postJournalEvent(dto);
    if (created) {
      res.status(201);
    }
    return { status: created ? "created" : "already_posted", entry };
  }

  @Get("members/search")
  @UseGuards(StaffJwtGuard)
  searchMembers(
    @Query("q") q?: string,
    @Query("firstName") firstName?: string,
    @Query("lastName") lastName?: string,
    @Query("memberId") memberId?: string,
    @Headers("authorization") authorization?: string,
  ) {
    const token = String(authorization ?? "").replace(/^Bearer\s+/i, "").trim();
    return this.integrations.searchMembers({ q, firstName, lastName, memberId }, token);
  }

  @Get("members/:participantId/summary")
  @UseGuards(StaffJwtGuard)
  getMemberSummary(@Param("participantId", ParseUUIDPipe) participantId: string) {
    return this.integrations.getMemberSummary(participantId);
  }
}
