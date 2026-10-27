import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TeacherStatus,
  TimetableImportStatus,
  TimetableSourceType,
  TimetableVersionStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { FilesService } from '../files/files.service';
import { LocalStorageService } from '../files/local-storage.service';
import { AuditService } from '../audit/audit.service';
import { PageOcrService } from '../lessons/page-ocr.service';
import { parseTimetableCsv } from './timetable-csv';
import { buildPeriodInputsFromExtracted } from './timetable-period-build';
import { matchSectionsForClassLabel, SectionCandidate } from './timetable-matching';
import { TimetableVersionsService } from './timetable-versions.service';

const CSV_MIMES = new Set(['text/csv', 'application/vnd.ms-excel', 'text/plain']);
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class TimetableImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly ocr: PageOcrService,
    private readonly versions: TimetableVersionsService,
    private readonly storage: LocalStorageService,
  ) {}

  async list(schoolId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.timetableImport.findMany({
        where: { schoolId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          status: true,
          sourceType: true,
          originalFilename: true,
          createdAt: true,
          academicYearId: true,
        },
      }),
      this.prisma.timetableImport.count({ where: { schoolId } }),
    ]);
    return { items: rows, total, page, limit };
  }

  async getImport(schoolId: string, importId: string) {
    return this.buildImportPayload(schoolId, importId);
  }

  async upload(user: AuthUser, file: Express.Multer.File, academicYearId?: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    if (!file?.buffer?.length) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'File is required' });
    }

    const mime = file.mimetype?.toLowerCase() ?? '';
    const name = file.originalname?.toLowerCase() ?? '';
    let sourceType: TimetableSourceType;
    if (CSV_MIMES.has(mime) || name.endsWith('.csv')) {
      sourceType = TimetableSourceType.CSV;
    } else if (IMAGE_MIMES.has(mime)) {
      sourceType = TimetableSourceType.IMAGE;
    } else if (name.endsWith('.xlsx') || name.endsWith('.pdf') || mime.includes('spreadsheet') || mime === 'application/pdf') {
      throw new BadRequestException({
        code: 'UNSUPPORTED_TIMETABLE_FORMAT',
        message: 'Save the timetable as CSV or upload a clear photo (JPEG/PNG/WebP). XLSX and PDF are not supported yet.',
      });
    } else {
      throw new BadRequestException({
        code: 'UNSUPPORTED_TIMETABLE_FORMAT',
        message: 'Unsupported file type. Use CSV or an image (JPEG/PNG/WebP).',
      });
    }

    const year = await this.resolveYear(schoolId, academicYearId);
    const asset = await this.files.saveSchoolUpload(schoolId, user.id, file, 'timetables');

    const importRow = await this.prisma.timetableImport.create({
      data: {
        schoolId,
        academicYearId: year.id,
        fileAssetId: asset.id,
        sourceType,
        status: TimetableImportStatus.UPLOADED,
        originalFilename: file.originalname,
        uploadedById: user.id,
      },
    });

    try {
      await this.extractImport(schoolId, user.id, importRow.id, file, sourceType);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed';
      await this.prisma.timetableImport.update({
        where: { id: importRow.id },
        data: { status: TimetableImportStatus.FAILED, warnings: [{ code: 'EXTRACTION_FAILED', message }] as Prisma.InputJsonValue },
      });
    }

    this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'TIMETABLE_IMPORTED',
      entityType: 'TimetableImport',
      entityId: importRow.id,
    });

    return this.buildImportPayload(schoolId, importRow.id);
  }

  async reExtract(user: AuthUser, importId: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const importRow = await this.prisma.timetableImport.findFirst({
      where: { id: importId, schoolId },
      include: { fileAsset: true },
    });
    if (!importRow) {
      throw new NotFoundException({ code: 'IMPORT_NOT_FOUND', message: 'Import not found' });
    }
    const published = await this.prisma.timetableVersion.count({
      where: { importId, status: TimetableVersionStatus.PUBLISHED },
    });
    if (published > 0) {
      throw new ConflictException({
        code: 'IMPORT_ALREADY_PUBLISHED',
        message: 'Cannot re-extract: a version from this import is already published',
      });
    }

    await this.prisma.timetableVersion.deleteMany({
      where: { importId, status: TimetableVersionStatus.DRAFT },
    });

    if (!importRow.fileAsset) {
      throw new BadRequestException({ code: 'FILE_MISSING', message: 'Import file is missing' });
    }

    const buffer = await this.readFileBuffer(importRow.fileAsset.storageKey);
    const fakeFile = {
      buffer,
      mimetype: importRow.fileAsset.mimeType,
      originalname: importRow.originalFilename ?? 'timetable.csv',
    } as Express.Multer.File;

    await this.extractImport(schoolId, user.id, importId, fakeFile, importRow.sourceType);
    return this.buildImportPayload(schoolId, importId);
  }

  async discard(user: AuthUser, importId: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const importRow = await this.prisma.timetableImport.findFirst({ where: { id: importId, schoolId } });
    if (!importRow) {
      throw new NotFoundException({ code: 'IMPORT_NOT_FOUND', message: 'Import not found' });
    }
    await this.prisma.timetableVersion.updateMany({
      where: { importId, status: TimetableVersionStatus.DRAFT },
      data: { status: TimetableVersionStatus.DISCARDED },
    });
    await this.prisma.timetableImport.update({
      where: { id: importId },
      data: { status: TimetableImportStatus.DISCARDED },
    });
    return { discarded: true };
  }

  private async extractImport(
    schoolId: string,
    userId: string,
    importId: string,
    file: Express.Multer.File,
    sourceType: TimetableSourceType,
  ) {
    let csvText = '';
    let warnings: Array<{ code: string; message: string }> = [];

    if (sourceType === TimetableSourceType.CSV) {
      csvText = file.buffer.toString('utf8');
    } else {
      const texts = await this.ocr.readPageTexts([{ buffer: file.buffer, mimetype: file.mimetype }], {
        subjectName: 'General',
      });
      csvText = texts.join('\n');
      warnings.push({
        code: 'IMAGE_OCR_ONLY',
        message: 'Timetable was read with OCR. Review all cells carefully or upload CSV for best results.',
      });
      if (!csvText.trim()) {
        throw new BadRequestException({
          code: 'TIMETABLE_EXTRACTION_FAILED',
          message: 'Could not read text from the image. Enter the timetable manually or upload CSV.',
        });
      }
    }

    const parsed = parseTimetableCsv(csvText);
    warnings = [...warnings, ...parsed.warnings];

    const [subjects, teachers, sections] = await Promise.all([
      this.prisma.subject.findMany({ where: { schoolId }, select: { id: true, name: true, code: true } }),
      this.prisma.teacherProfile.findMany({
        where: { schoolId, status: TeacherStatus.ACTIVE },
        select: { id: true, gender: true, user: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.section.findMany({
        where: { schoolId },
        select: { id: true, name: true, grade: { select: { id: true, name: true, level: true } } },
      }),
    ]);

    const sectionCandidates: SectionCandidate[] = sections.map((s) => ({
      id: s.id,
      name: s.name,
      grade: s.grade,
    }));

    const sectionMatch = matchSectionsForClassLabel(parsed.classLabel, sectionCandidates);
    const periodInputs = buildPeriodInputsFromExtracted(parsed.rows, subjects, teachers);
    const validation = this.versions.validatePeriodRows(
      periodInputs.map((p) => ({
        weekday: p.weekday,
        periodNumber: p.periodNumber,
        kind: p.kind,
        startTime: p.startTime,
        endTime: p.endTime,
        label: p.label,
        subjectId: p.subjectId,
        teacherId: p.teacherId,
      })),
    );

    const importRow = await this.prisma.timetableImport.findFirst({ where: { id: importId, schoolId } });
    if (!importRow) return;

    const unresolvedClasses: Array<{ classLabel: string | null; sectionIds?: string[] }> = [];
    const createdVersions: Array<{ id: string; sectionId: string | null; classLabel: string | null; validation: unknown }> = [];

    if (sectionMatch.status === 'MATCHED' && sectionMatch.sectionId) {
      const version = await this.createDraftVersion(
        schoolId,
        userId,
        importRow.academicYearId,
        importId,
        sourceType,
        sectionMatch.sectionId,
        periodInputs,
        validation,
        parsed.classLabel,
      );
      createdVersions.push({
        id: version.id,
        sectionId: sectionMatch.sectionId,
        classLabel: parsed.classLabel,
        validation,
      });
    } else if (sectionMatch.status === 'SECTION_SELECTION_REQUIRED') {
      unresolvedClasses.push({ classLabel: parsed.classLabel, sectionIds: sectionMatch.sectionIds });
    } else {
      unresolvedClasses.push({ classLabel: parsed.classLabel });
    }

    await this.prisma.timetableImport.update({
      where: { id: importId },
      data: {
        status: TimetableImportStatus.EXTRACTED,
        extractedText: csvText.slice(0, 500_000),
        warnings: [...warnings, ...(unresolvedClasses.length ? [{ code: 'UNRESOLVED_CLASS', message: JSON.stringify(unresolvedClasses) }] : [])] as Prisma.InputJsonValue,
      },
    });

    return { createdVersions, unresolvedClasses };
  }

  private async createDraftVersion(
    schoolId: string,
    userId: string,
    academicYearId: string,
    importId: string,
    sourceType: TimetableSourceType,
    sectionId: string,
    periods: ReturnType<typeof buildPeriodInputsFromExtracted>,
    validation: unknown,
    classLabel: string | null,
  ) {
    const maxNum = await this.prisma.timetableVersion.aggregate({
      where: { sectionId, academicYearId },
      _max: { versionNumber: true },
    });

    return this.prisma.timetableVersion.create({
      data: {
        schoolId,
        academicYearId,
        sectionId,
        importId,
        sourceType,
        versionNumber: (maxNum._max.versionNumber ?? 0) + 1,
        status: TimetableVersionStatus.DRAFT,
        revision: 0,
        createdById: userId,
        notes: classLabel ? `Imported for ${classLabel}` : null,
        validation: validation as Prisma.InputJsonValue,
        periods: {
          create: periods.map((p, i) => ({
            weekday: p.weekday,
            periodNumber: p.periodNumber,
            kind: p.kind,
            startTime: p.startTime,
            endTime: p.endTime,
            label: p.label,
            subjectId: p.subjectId,
            teacherId: p.teacherId,
            room: p.room,
            rawSubjectText: p.rawSubjectText,
            rawTeacherText: p.rawTeacherText,
            sortOrder: i,
          })),
        },
      },
    });
  }

  private async buildImportPayload(schoolId: string, importId: string) {
    const importRow = await this.prisma.timetableImport.findFirst({
      where: { id: importId, schoolId },
      include: {
        versions: {
          where: { status: { not: TimetableVersionStatus.DISCARDED } },
          include: {
            section: { select: { id: true, name: true, grade: { select: { name: true } } } },
            periods: { orderBy: [{ weekday: 'asc' }, { sortOrder: 'asc' }] },
          },
        },
      },
    });
    if (!importRow) {
      throw new NotFoundException({ code: 'IMPORT_NOT_FOUND', message: 'Import not found' });
    }

    const versions = importRow.versions.map((v) => ({
      id: v.id,
      sectionId: v.sectionId,
      classLabel: v.notes,
      section: v.section,
      periods: v.periods,
      validation: v.validation,
      revision: v.revision,
      status: v.status,
    }));

    return {
      import: {
        id: importRow.id,
        status: importRow.status,
        sourceType: importRow.sourceType,
        originalFilename: importRow.originalFilename,
        warnings: importRow.warnings,
        createdAt: importRow.createdAt,
      },
      versions,
      unresolvedClasses: [] as unknown[],
    };
  }

  private async resolveYear(schoolId: string, academicYearId?: string) {
    if (academicYearId) {
      const year = await this.prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
      if (!year) throw new NotFoundException({ code: 'ACADEMIC_YEAR_NOT_FOUND', message: 'Academic year not found' });
      return year;
    }
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
    });
    if (!year) throw new BadRequestException({ code: 'ACADEMIC_YEAR_NOT_FOUND', message: 'No current academic year' });
    return year;
  }

  private async readFileBuffer(storageKey: string): Promise<Buffer> {
    return this.storage.readBuffer(storageKey);
  }
}
