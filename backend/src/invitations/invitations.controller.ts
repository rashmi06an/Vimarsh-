import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InvitationsService } from './invitations.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';

@ApiTags('invitations')
@ApiBearerAuth()
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get('me')
  @ApiOperation({ summary: 'My pending invitations' })
  mine(@CurrentUser() user: AuthedUser) {
    return this.invitations.mine(user);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept an invitation' })
  accept(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.invitations.respond(user, id, true);
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline an invitation' })
  decline(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.invitations.respond(user, id, false);
  }
}
