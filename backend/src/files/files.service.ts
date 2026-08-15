import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from '../common/types/auth-user.type';
import { LocalStorageService } from './local-storage.service';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly localStorage: LocalStorageService,
    private readonly config: ConfigService,
  ) {}

  async upload(file: Express.Multer.File | undefined, user: AuthUser) {
    if (!file) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'File is required',
      });
    }

    const storageEndpoint = this.config.get<string>('STORAGE_ENDPOINT');
    // When STORAGE_ENDPOINT is empty, use local disk storage abstraction.
    if (storageEndpoint && storageEndpoint.trim() !== '') {
      throw new BadRequestException({
        code: 'REMOTE_STORAGE_NOT_WIRED',
        message: 'Remote S3 storage is configured but not implemented in this build; clear STORAGE_ENDPOINT to use local disk',
      });
    }

    const stored = await this.localStorage.save(file, user.schoolId ?? 'platform');
    return this.prisma.fileAsset.create({
      data: {
        schoolId: user.schoolId ?? undefined,
        uploadedById: user.id,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        size: stored.size,
        storageKey: stored.storageKey,
        url: stored.url,
      },
    });
  }

  async findAll(user: AuthUser, query: PaginationDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.FileAssetWhereInput = {
      ...(user.schoolId ? { schoolId: user.schoolId } : {}),
    };
    const [items, total] = await pageQuery(
      this.prisma.fileAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.fileAsset.count({ where }),
    );
    return paginate(items, total, page, limit);
  }
}
