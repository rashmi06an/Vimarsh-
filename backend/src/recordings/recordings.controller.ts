import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RecordingsService } from './recordings.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';

@ApiTags('recordings')
@ApiBearerAuth()
@Controller()
export class RecordingsController {
  constructor(private readonly recordings: RecordingsService) {}

  @Post('meetings/:id/recording/start')
  @ApiOperation({ summary: 'Start server-side recording (host; only if policy allows)' })
  start(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.recordings.start(user, id);
  }

  @Post('meetings/:id/recording/stop')
  @ApiOperation({ summary: 'Stop the active recording (host)' })
  stop(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.recordings.stop(user, id);
  }

  @Get('meetings/:id/recordings')
  @ApiOperation({ summary: 'List recordings of a meeting' })
  list(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.recordings.list(user, id);
  }

  @Get('recordings/:id/url')
  @ApiOperation({ summary: 'Get a short-lived signed URL to a completed recording (audited)' })
  url(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.recordings.url(user, id);
  }
}
