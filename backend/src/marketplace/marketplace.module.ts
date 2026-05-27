import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LedgerModule } from "../ledger/ledger.module";
import { MarketplaceController } from "./marketplace.controller";
import { MarketplaceService } from "./marketplace.service";

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
