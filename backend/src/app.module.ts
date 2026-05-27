import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { envValidationSchema } from "./config/env.validation";
import { HealthModule } from "./health/health.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { LedgerModule } from "./ledger/ledger.module";
import { MarketplaceModule } from "./marketplace/marketplace.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RootController } from "./root.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    HealthModule,
    LedgerModule,
    IntegrationsModule,
    MarketplaceModule,
  ],
  controllers: [RootController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
