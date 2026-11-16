import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TokensService } from './tokens.service';
import { PasswordResetModule } from '../password-reset/password-reset.module';

@Module({
  imports: [JwtModule.register({}), PasswordResetModule],
  providers: [AuthService, TokensService],
  controllers: [AuthController],
  exports: [TokensService, JwtModule],
})
export class AuthModule {}
