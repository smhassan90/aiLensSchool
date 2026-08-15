import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { CreateProductCategoryDto, CreateProductDto } from './dto/shop.dto';

@Injectable()
export class ShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  async createCategory(dto: CreateProductCategoryDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    return this.prisma.productCategory.create({
      data: { name: dto.name, schoolId },
    });
  }

  async listCategories(user: AuthUser, query: PaginationDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ProductCategoryWhereInput = { schoolId };
    const [items, total] = await pageQuery(
      this.prisma.productCategory.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.productCategory.count({ where }),
    );
    return paginate(items, total, page, limit);
  }

  async createProduct(dto: CreateProductDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    return this.prisma.product.create({
      data: {
        schoolId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        branchId: dto.branchId,
        categoryId: dto.categoryId,
        sku: dto.sku,
        active: dto.active ?? true,
      },
    });
  }

  async listProducts(user: AuthUser, query: PaginationDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ProductWhereInput = { schoolId };
    const [items, total] = await pageQuery(
      this.prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { category: true },
      }),
      this.prisma.product.count({ where }),
    );
    return paginate(items, total, page, limit);
  }
}
