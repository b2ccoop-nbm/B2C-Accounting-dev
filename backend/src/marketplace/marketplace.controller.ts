import { Body, Controller, Get, HttpCode, Param, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { IntegrationAuthGuard } from "../auth/integration-auth.guard";
import { StaffJwtGuard } from "../auth/staff-jwt.guard";
import { MarketplaceSaleDto } from "./dto/marketplace-sale.dto";
import { MarketplaceService } from "./marketplace.service";

@Controller("api/v1/finance")
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Post("marketplace-sale")
  @UseGuards(IntegrationAuthGuard)
  @HttpCode(200)
  async postMarketplaceSale(@Body() dto: MarketplaceSaleDto, @Res({ passthrough: true }) res: Response) {
    const { created, entry } = await this.marketplace.postMarketplaceSale(dto);
    if (created) {
      res.status(201);
    }
    return { status: created ? "created" : "already_posted", entry };
  }

  @Get("vendors")
  @UseGuards(StaffJwtGuard)
  listVendors() {
    return this.marketplace.listVendors();
  }

  @Get("vendors/:code/ap-balance")
  @UseGuards(StaffJwtGuard)
  getVendorApBalance(@Param("code") code: string) {
    return this.marketplace.getVendorApBalance(code);
  }
}
