import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { UploadedFileLike } from './file-validation';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';

@ApiTags('documents')
@ApiBearerAuth()
@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('meetings/:id/documents')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a document to a meeting (content-validated)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 30 * 1024 * 1024 } }))
  upload(@CurrentUser() user: AuthedUser, @Param('id') id: string, @UploadedFile() file: UploadedFileLike) {
    return this.documents.upload(user, id, file);
  }

  @Get('meetings/:id/documents')
  @ApiOperation({ summary: 'List documents of a meeting' })
  list(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.documents.list(user, id);
  }

  @Get('documents/:id/download')
  @ApiOperation({ summary: 'Download a document (access-checked, decrypted server-side, audited)' })
  async download(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Res() res: Response) {
    // Encrypted at rest: the backend decrypts in memory only after the access check, then streams
    // the original bytes. No presigned URL is issued (that would expose ciphertext).
    const { fileName, contentType, data } = await this.documents.download(user, id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
    res.setHeader('Content-Length', data.length);
    res.send(data);
  }
}
