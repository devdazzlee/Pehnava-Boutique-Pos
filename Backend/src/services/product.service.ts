import { Prisma, Product } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { CreateProductInput, UpdateProductInput } from '../validations/product.validation';
import { Decimal } from 'decimal.js';
import { startOfMonth } from 'date-fns';
import { imageService } from './common/cloudinaryService';
import { randomUUID } from 'crypto';
import { addDecimal, asNumber } from '../utils/helpers';
import { generateUniqueNumericSku, isNineDigitNumericSku } from '../utils/numericBarcodeSku';
import { parsePagination, paginationMeta, MAX_LIMIT } from '../utils/pagination';


type RelationField =
    | 'unit_id' | 'tax_id' | 'category_id' | 'subcategory_id'
    | 'supplier_id' | 'brand_id' | 'color_id' | 'size_id';

type Numeric = number | Prisma.Decimal

export class ProductService {
    async getProductsForExcelExport(filters?: {
        search?: string;
        category_id?: string;
        subcategory_id?: string;
        supplier_id?: string;
        brand_id?: string;
        is_active?: boolean;
        display_on_pos?: boolean;
        display_on_website?: boolean;
    }) {
        const where: Prisma.ProductWhereInput = {};

        if (filters?.search) {
            where.OR = [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { sku: { contains: filters.search, mode: 'insensitive' } },
                { code: { contains: filters.search, mode: 'insensitive' } },
            ];
        }

        if (filters?.category_id) where.category_id = filters.category_id;
        if (filters?.subcategory_id) where.subcategory_id = filters.subcategory_id;
        if (filters?.supplier_id) where.supplier_id = filters.supplier_id;
        if (filters?.brand_id) where.brand_id = filters.brand_id;
        if (filters?.is_active !== undefined) where.is_active = filters.is_active;
        if (filters?.display_on_pos !== undefined) where.display_on_pos = filters.display_on_pos;
        if (filters?.display_on_website !== undefined) where.display_on_website = filters.display_on_website;

        return prisma.product.findMany({
            where,
            orderBy: { created_at: 'desc' },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                subcategory: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                unit: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                tax: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        percentage: true,
                    },
                },
                supplier: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                brand: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                color: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                size: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                ProductImage: {
                    where: { status: 'COMPLETE' },
                    select: {
                        image: true,
                    },
                },
                stock: {
                    select: {
                        branch_id: true,
                        current_quantity: true,
                        reserved_quantity: true,
                        minimum_quantity: true,
                        maximum_quantity: true,
                    },
                },
            },
        });
    }

    private async getOrCreateUnknownEntry(modelName: string, codePrefix: string, tx?: any) {
        const unknownName = 'Unknown';
        const unknownCode = `${codePrefix}-UNKNOWN`;
        
        // Use transaction context if provided, otherwise use regular prisma
        const prismaClient = tx || prisma;
        
        try {
            console.log(`🔍 Looking for existing ${modelName} with name: "${unknownName}"`);
            
            // Try to find existing unknown entry
            let unknownEntry = await prismaClient[modelName].findFirst({
                where: { name: unknownName }
            });

            if (unknownEntry) {
                console.log(`✅ Found existing ${modelName} with ID: ${unknownEntry.id}`);
            } else {
                console.log(`❌ No existing ${modelName} found, creating new one...`);
                
                // If not found, create it
                const timestamp = Date.now().toString().slice(-6);
                const uniqueSlug = `unknown-${timestamp}`;
                
                // Create data object with any type to allow additional properties
                let modelData: any = {
                    name: unknownName,
                    code: unknownCode,
                    is_active: true,
                    display_on_pos: true,
                };

                // Add model-specific fields
                switch (modelName) {
                    case 'tax':
                        modelData.percentage = 0;
                        break;
                    case 'category':
                        modelData.slug = uniqueSlug;
                        break;
                    case 'subcategory':
                        // Subcategory doesn't have slug field, so just use base data
                        break;
                    case 'unit':
                    case 'supplier':
                    case 'brand':
                    case 'color':
                    case 'size':
                        // These models only need base data
                        break;
                }
                
                console.log(`📝 Creating ${modelName} with data:`, modelData);
                
                unknownEntry = await prismaClient[modelName].create({
                    data: modelData
                });
                
                console.log(`✅ Created ${modelName} with ID: ${unknownEntry.id}`);
            }

            return unknownEntry.id;
        } catch (error) {
            console.log(`❌ Error in getOrCreateUnknownEntry for ${modelName}:`, error);
            throw error;
        }
    }

    private async getOrCreateEntryByName(modelName: string, entryName: string, codePrefix: string, tx?: any) {
        if (!entryName || entryName.trim() === '') {
            // If no name provided, use unknown entry
            return await this.getOrCreateUnknownEntry(modelName, codePrefix, tx);
        }

        const trimmedName = entryName.trim();
        
        // Use transaction context if provided, otherwise use regular prisma
        const prismaClient = tx || prisma;
        
        try {
            console.log(`🔍 Looking for existing ${modelName} with name: "${trimmedName}"`);
            
            // Try to find existing entry by name
            let entry = await prismaClient[modelName].findFirst({
                where: { name: trimmedName }
            });

            if (entry) {
                console.log(`✅ Found existing ${modelName} with ID: ${entry.id}`);
            } else {
                console.log(`❌ No existing ${modelName} found, creating new one...`);
                
                // If not found, create it
                const timestamp = Date.now().toString().slice(-6);
                const uniqueSlug = `${trimmedName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}`;
                
                // Get last entry for code generation
                const lastEntry = await prismaClient[modelName].findFirst({
                    orderBy: { created_at: 'desc' },
                    select: { code: true }
                });
                
                let newCode = `${Date.now().toString().slice(-4)}-${randomUUID().slice(0, 5)}`;

                if (lastEntry && lastEntry.code) {
                    const lastCodeNum = parseInt(lastEntry.code);
                    newCode = !isNaN(lastCodeNum) ? (lastCodeNum + 1).toString() : `${Date.now().toString().slice(-6)}`;
                }                
                
                // Create data object with any type to allow additional properties
                let modelData: any = {
                    name: trimmedName,
                    code: newCode,
                    is_active: true,
                    display_on_pos: true,
                };

                // Add model-specific fields
                switch (modelName) {
                    case 'tax':
                        modelData.percentage = 0;
                        break;
                    case 'category':
                        modelData.slug = uniqueSlug;
                        break;
                    case 'subcategory':
                        // Subcategory doesn't have slug field, so just use base data
                        break;
                    case 'unit':
                    case 'supplier':
                    case 'brand':
                    case 'color':
                    case 'size':
                        // These models only need base data
                        break;
                }
                
                console.log(`📝 Creating ${modelName} with data:`, modelData);
                
                entry = await prismaClient[modelName].create({
                    data: modelData
                });
                
                console.log(`✅ Created ${modelName} with ID: ${entry.id}`);
            }

            return entry.id;
        } catch (error) {
            console.log(`❌ Error in getOrCreateEntryByName for ${modelName}:`, error);
            throw error;
        }
    }

    /** SKU = 9-digit numeric barcode; must be unique. Auto-generates when omitted. */
    private async resolveSkuForCreate(
        data: CreateProductInput,
        tx: Prisma.TransactionClient
    ): Promise<string> {
        const trimmed = data.sku?.trim();
        if (trimmed) {
            if (!isNineDigitNumericSku(trimmed)) {
                throw new AppError(400, 'SKU must be exactly 9 digits (numbers only) for barcode use');
            }
            const clash = await tx.product.findUnique({
                where: { sku: trimmed },
                select: { id: true },
            });
            if (clash) {
                throw new AppError(400, 'Product with this SKU already exists');
            }
            return trimmed;
        }
        return generateUniqueNumericSku(tx);
    }

    private buildProductData(data: CreateProductInput, code: string) {
        const productData: any = {
            name: data.name,
            sku: data.sku || '', // Will be set in createProduct method
            code,
            purchase_rate: data.purchase_rate,
            sales_rate_exc_dis_and_tax: data.sales_rate_exc_dis_and_tax,
            sales_rate_inc_dis_and_tax: data.sales_rate_inc_dis_and_tax,
            discount_amount: data.discount_amount ?? 0,
            min_qty: data.min_qty ?? 10,
            max_qty: data.max_qty ?? 10,
            is_active: data.is_active ?? true,
            display_on_pos: data.display_on_pos ?? true,
            display_on_website: data.display_on_website ?? true,
            is_batch: data.is_batch ?? false,
            auto_fill_on_demand_sheet: data.auto_fill_on_demand_sheet ?? false,
            non_inventory_item: data.non_inventory_item ?? false,
            is_deal: data.is_deal ?? false,
            is_featured: data.is_featured ?? false,
        };

        // Only add optional fields if they have values
        if (data.pct_or_hs_code !== undefined) {
            productData.pct_or_hs_code = data.pct_or_hs_code;
        }
        if (data.description !== undefined) {
            productData.description = data.description;
        }

        return productData;
    }

    private buildUpdateProductData(data: UpdateProductInput) {
        const updateData: any = {};
        
        if (data.name !== undefined) updateData.name = data.name;
        // Only update SKU if explicitly provided and not empty
        if (data.sku !== undefined && data.sku !== null && data.sku !== '') updateData.sku = data.sku;
        if (data.pct_or_hs_code !== undefined) updateData.pct_or_hs_code = data.pct_or_hs_code;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.purchase_rate !== undefined) updateData.purchase_rate = new Decimal(data.purchase_rate).toNumber();
        if (data.sales_rate_exc_dis_and_tax !== undefined) updateData.sales_rate_exc_dis_and_tax = new Decimal(data.sales_rate_exc_dis_and_tax).toNumber();
        if (data.sales_rate_inc_dis_and_tax !== undefined) updateData.sales_rate_inc_dis_and_tax = new Decimal(data.sales_rate_inc_dis_and_tax).toNumber();
        if (data.discount_amount !== undefined) updateData.discount_amount = new Decimal(data.discount_amount).toNumber();
        if (data.min_qty !== undefined) updateData.min_qty = data.min_qty;
        if (data.max_qty !== undefined) updateData.max_qty = data.max_qty;
        if (data.is_active !== undefined) updateData.is_active = data.is_active;
        if (data.display_on_pos !== undefined) updateData.display_on_pos = data.display_on_pos;
        if (data.display_on_website !== undefined) updateData.display_on_website = data.display_on_website;
        if (data.is_batch !== undefined) updateData.is_batch = data.is_batch;
        if (data.auto_fill_on_demand_sheet !== undefined) updateData.auto_fill_on_demand_sheet = data.auto_fill_on_demand_sheet;
        if (data.non_inventory_item !== undefined) updateData.non_inventory_item = data.non_inventory_item;
        if (data.is_deal !== undefined) updateData.is_deal = data.is_deal;
        if (data.is_featured !== undefined) updateData.is_featured = data.is_featured;

        return updateData;
    }

    private buildRelationIncludes(data: CreateProductInput) {
        const includes: Record<string, boolean> = {};
        const relationFields: RelationField[] = [
            'unit_id', 'tax_id', 'category_id', 'subcategory_id',
            'supplier_id', 'brand_id', 'color_id', 'size_id'
        ];

        relationFields.forEach(field => {
                const relationName = field.split('_')[0];
                includes[relationName] = true;
        });

        return includes;
    }

    async createProduct(data: CreateProductInput): Promise<Product> {
        // Step 1: Resolve the next product code and all "Unknown" fallback
        // entries OUTSIDE the transaction. These are idempotent lookups that
        // don't need to be atomic with the insert, and pulling them out of the
        // transaction is what stops Prisma's P2028 timeout on a slow remote
        // Postgres (each query was a fresh round-trip costing ~1s).
        const lastProduct = await prisma.product.findFirst({
            orderBy: { created_at: 'desc' },
            select: { code: true }
        });
        const newCode = lastProduct ? (parseInt(lastProduct.code) + 1).toString() : '1000';

        const unknownEntries = await this.ensureUnknownEntriesExist(prisma);
        console.log('✅ Unknown entries ensured:', unknownEntries);

        const verifiedRelations = await this.verifyAndFixRelationsForCreate(
            data,
            this.buildRelationsWithUnknownEntries(data, unknownEntries),
            prisma,
        );
        console.log('📦 Relations built:', JSON.stringify(verifiedRelations, null, 2));

        // Step 2: Inside the transaction we only do the SKU collision check
        // and the actual product.create — fast and atomic.
        return await prisma.$transaction(async (tx) => {
            console.log('🚀 Starting transaction for product creation...');

            const sku = await this.resolveSkuForCreate(data, tx);
            const productData = this.buildProductData(data, newCode);

            const finalData = {
                ...productData,
                sku,
                ...verifiedRelations,
            };

            console.log('📤 Final data being sent to Prisma:');
            console.log(JSON.stringify(finalData, null, 2));

            const product = await tx.product.create({
                data: finalData,
                include: this.buildRelationIncludes(data),
            });

            console.log('✅ Product created successfully with ID:', product.id);
            return product;
        }, {
            // Generous budget; the heavy lifting now happens outside the tx so
            // this is effectively just SKU check + one INSERT.
            maxWait: 30000,
            timeout: 30000,
        });
    }

    private async ensureUnknownEntriesExist(tx: any) {
        const unknownEntries: Record<string, string> = {};
        
        const models = [
            { name: 'unit', codePrefix: 'UNIT' },
            { name: 'category', codePrefix: 'CAT' },
            { name: 'tax', codePrefix: 'TAX' },
            { name: 'supplier', codePrefix: 'SUP' },
            { name: 'brand', codePrefix: 'BRA' },
            { name: 'color', codePrefix: 'COL' },
            { name: 'size', codePrefix: 'SIZ' },
            { name: 'subcategory', codePrefix: 'SUB' }
        ];

        for (const model of models) {
            const unknownId = await this.getOrCreateUnknownEntry(model.name, model.codePrefix, tx);
            unknownEntries[model.name] = unknownId;
        }

        return unknownEntries;
    }

    private buildRelationsWithUnknownEntries(data: CreateProductInput, unknownEntries: Record<string, string>) {
        const relations: Record<string, { connect: { id: string } }> = {};
        
        // Map of field names to their corresponding model names
        const fieldToModel: Record<string, string> = {
            'unit_id': 'unit',
            'category_id': 'category',
            'tax_id': 'tax',
            'supplier_id': 'supplier',
            'brand_id': 'brand',
            'color_id': 'color',
            'size_id': 'size',
            'subcategory_id': 'subcategory'
        };

        // Process each field
        for (const [field, modelName] of Object.entries(fieldToModel)) {
            const value = (data as any)[field];
            const relationName = field.split('_')[0];
            
            if (value) {
                // Use provided ID - but we'll verify it exists in the transaction
                relations[relationName] = { connect: { id: value } };
                console.log(`✅ Using provided ${relationName} with ID: ${value}`);
            } else {
                // Use unknown entry
                const unknownId = unknownEntries[modelName];
                relations[relationName] = { connect: { id: unknownId } };
                console.log(`✅ Using unknown ${relationName} with ID: ${unknownId}`);
            }
        }

        console.log('📦 Final relations object:', JSON.stringify(relations, null, 2));
        return relations;
    }

    private async verifyAndFixRelationsForCreate(data: CreateProductInput, initialRelations: Record<string, { connect: { id: string } }>, tx: any) {
        const verifiedRelations: Record<string, { connect: { id: string } }> = {};
        
        // Map of field names to their corresponding model names
        const fieldToModel: Record<string, string> = {
            'unit_id': 'unit',
            'category_id': 'category',
            'tax_id': 'tax',
            'supplier_id': 'supplier',
            'brand_id': 'brand',
            'color_id': 'color',
            'size_id': 'size',
            'subcategory_id': 'subcategory'
        };

        // Verify each relation
        for (const [field, modelName] of Object.entries(fieldToModel)) {
            const value = (data as any)[field];
            const relationName = field.split('_')[0];
            
            if (value) {
                // Verify the provided ID exists
                try {
                    const existingRecord = await tx[modelName].findUnique({
                        where: { id: value },
                        select: { id: true }
                    });
                    
                    if (existingRecord) {
                        verifiedRelations[relationName] = { connect: { id: value } };
                        console.log(`✅ Verified existing ${relationName} with ID: ${value}`);
                    } else {
                        // ID doesn't exist, use unknown entry
                        const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                        verifiedRelations[relationName] = { connect: { id: unknownId } };
                        console.log(`❌ Provided ${relationName} ID ${value} not found, using unknown with ID: ${unknownId}`);
                    }
                } catch (error) {
                    // Error occurred, use unknown entry
                    const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                    verifiedRelations[relationName] = { connect: { id: unknownId } };
                    console.log(`❌ Error verifying ${relationName} ID ${value}, using unknown with ID: ${unknownId}`);
                }
            } else {
                // Use unknown entry
                const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                verifiedRelations[relationName] = { connect: { id: unknownId } };
                console.log(`✅ Using unknown ${relationName} with ID: ${unknownId}`);
            }
        }

        return verifiedRelations;
    }

    private async verifyAndFixRelationsForUpdate(data: UpdateProductInput, initialRelations: Record<string, { connect: { id: string } }>, tx: any) {
        const verifiedRelations: Record<string, { connect: { id: string } }> = {};
        
        // Map of field names to their corresponding model names
        const fieldToModel: Record<string, string> = {
            'unit_id': 'unit',
            'category_id': 'category',
            'tax_id': 'tax',
            'supplier_id': 'supplier',
            'brand_id': 'brand',
            'color_id': 'color',
            'size_id': 'size',
            'subcategory_id': 'subcategory'
        };

        // Verify each relation that was provided in the update
        for (const [field, modelName] of Object.entries(fieldToModel)) {
            const value = (data as any)[field];
            if (value !== undefined) { // Only process fields that are explicitly provided
                const relationName = field.split('_')[0];
                
                if (value) {
                    // Verify the provided ID exists
                    try {
                        const existingRecord = await tx[modelName].findUnique({
                            where: { id: value },
                            select: { id: true }
                        });
                        
                        if (existingRecord) {
                            verifiedRelations[relationName] = { connect: { id: value } };
                            console.log(`✅ Verified existing ${relationName} with ID: ${value}`);
                        } else {
                            // ID doesn't exist, use unknown entry
                            const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                            verifiedRelations[relationName] = { connect: { id: unknownId } };
                            console.log(`❌ Provided ${relationName} ID ${value} not found, using unknown with ID: ${unknownId}`);
                        }
                    } catch (error) {
                        // Error occurred, use unknown entry
                        const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                        verifiedRelations[relationName] = { connect: { id: unknownId } };
                        console.log(`❌ Error verifying ${relationName} ID ${value}, using unknown with ID: ${unknownId}`);
                    }
                } else {
                    // Use unknown entry for null/empty values
                    const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                    verifiedRelations[relationName] = { connect: { id: unknownId } };
                    console.log(`✅ Using unknown ${relationName} with ID: ${unknownId}`);
                }
            }
        }

        return verifiedRelations;
    }

    /** Stores uploaded images under the product's name (local storage), e.g. products/ajwa-dates-2.jpg */
    private async nameProductImages(productId: string, urls: string[]): Promise<string[]> {
        if (urls.length === 0) return urls;
        const product = await prisma.product.findUnique({
            where: { id: productId },
            select: { name: true }
        });
        return imageService.finalizeImages(urls, 'products', product?.name || productId);
    }

    async processProductImages(productId: string, files: Express.Multer.File[]) {
        try {
            // 1. Upload images
            const imageUrls = await this.nameProductImages(
                productId,
                await imageService.uploadMultipleImages(files)
            );

            // 2. Create image records
            await prisma.productImage.createMany({
                data: imageUrls.map(url => ({
                    product_id: productId,
                    image: url,
                    status: 'COMPLETE'
                }))
            });

            // 3. Optional: Update product to indicate images are ready
            await prisma.product.update({
                where: { id: productId },
                data: { has_images: true }
            });
            console.log('Images processed successfully:', imageUrls);

        } catch (error) {
            const err = error as Error;
            // Mark failed attempts
            await prisma.productImage.createMany({
                data: files.map(file => ({
                    product_id: productId,
                    image: `failed-${file.originalname}`, // Required field
                    status: 'FAILED',
                    error: err.message.substring(0, 255) // Truncate if needed
                }))
            });
            throw error;
        }
    }

    /**
     * Link pre-uploaded image URLs to a product (used after upload-image endpoint)
     */
    async addProductImageUrls(productId: string, uploadedUrls: string[]) {
        if (uploadedUrls.length === 0) return;
        const urls = await this.nameProductImages(productId, uploadedUrls);
        await prisma.productImage.createMany({
            data: urls.map(url => ({
                product_id: productId,
                image: url,
                status: 'COMPLETE' as const,
            }))
        });
        await prisma.product.update({
            where: { id: productId },
            data: { has_images: true }
        });
        console.log(`Added ${urls.length} image URLs to product ${productId}`);
    }

    async updateProductImagesFromBase64(productId: string, base64Images: string[], keepImageUrls: string[]) {
        try {
            // 1. Get ALL current image records for this product
            const currentImages = await prisma.productImage.findMany({
                where: { product_id: productId },
                select: { id: true, image: true }
            });

            // 2. Determine which images to delete (not in keepImageUrls)
            const imagesToDelete = keepImageUrls.length > 0
                ? currentImages.filter(img => !keepImageUrls.includes(img.image))
                : currentImages; // delete all if nothing to keep

            // 3. Delete old images from the active storage (others, e.g. S3, are just orphaned)
            if (imagesToDelete.length > 0) {
                const ownedUrls = imagesToDelete
                    .map(img => img.image)
                    .filter(url => imageService.ownsUrl(url));

                if (ownedUrls.length > 0) {
                    await imageService.deleteMultipleImages(ownedUrls);
                    console.log(`Deleted ${ownedUrls.length} old images from storage`);
                }

                // 4. Delete old image DB records
                await prisma.productImage.deleteMany({
                    where: {
                        id: { in: imagesToDelete.map(img => img.id) }
                    }
                });
                console.log(`Deleted ${imagesToDelete.length} old image records from DB`);
            }

            // 5. Upload new base64 images and create records
            if (base64Images.length > 0) {
                const imageUrls = await this.nameProductImages(
                    productId,
                    await imageService.uploadMultipleBase64Images(base64Images)
                );
                await prisma.productImage.createMany({
                    data: imageUrls.map(url => ({
                        product_id: productId,
                        image: url,
                        status: 'COMPLETE' as const
                    }))
                });
                console.log(`Uploaded ${imageUrls.length} new images`);
            }

            // 5b. Link any pre-uploaded URLs that aren't already in the DB
            const currentImageUrls = new Set(currentImages.map(img => img.image));
            const newPreUploadedUrls = await this.nameProductImages(
                productId,
                keepImageUrls.filter(url => !currentImageUrls.has(url))
            );
            if (newPreUploadedUrls.length > 0) {
                await prisma.productImage.createMany({
                    data: newPreUploadedUrls.map(url => ({
                        product_id: productId,
                        image: url,
                        status: 'COMPLETE' as const
                    }))
                });
                console.log(`Linked ${newPreUploadedUrls.length} pre-uploaded images to product ${productId}`);
            }

            // 6. Update has_images flag
            const imageCount = await prisma.productImage.count({
                where: { product_id: productId }
            });

            await prisma.product.update({
                where: { id: productId },
                data: { has_images: imageCount > 0 }
            });

            console.log(`Images updated for product ${productId}: kept ${keepImageUrls.length}, deleted ${imagesToDelete.length}, uploaded ${base64Images.length}`);
        } catch (error) {
            console.error('Error updating product images:', error);
            throw error;
        }
    }

    async getProductById(id: string) {
        const product = await prisma.product.findUnique({
            where: { id },
            include: {
                unit: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                subcategory: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                ProductImage: {
                    select: {
                        image: true,
                    },
                },
                tax: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                supplier: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                brand: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                color: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                size: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                // Per-branch stock — surfaced so the Edit dialog can
                // pre-select the branches a product already lives in.
                stock: {
                    select: {
                        branch_id: true,
                        current_quantity: true,
                        reserved_quantity: true,
                    },
                },
            },
        });

        if (!product) {
            throw new AppError(404, 'Product not found');
        }

        return product;
    }

    async updateProduct(id: string, data: UpdateProductInput) {
        // Verify product exists
        const product = await this.getProductById(id);

        if (data.sku !== undefined && data.sku !== null && String(data.sku).trim() !== '') {
            const nextSku = String(data.sku).trim();
            if (!isNineDigitNumericSku(nextSku)) {
                throw new AppError(400, 'SKU must be exactly 9 digits (numbers only) for barcode use');
            }
        }

        // Check if new SKU conflicts with existing
        if (data.sku && data.sku !== product.sku) {
            const existingSku = await prisma.product.findUnique({
                where: { sku: data.sku },
                select: { id: true },
            });
            if (existingSku) {
                throw new AppError(400, 'Product with this SKU already exists');
            }
        }

        // Build the update payload — scalar fields + relation FKs in one shot
        const updateData: any = { ...this.buildUpdateProductData(data) };

        // Set relation foreign keys directly (no extra verification queries needed;
        // the DB's FK constraints will catch invalid IDs automatically)
        // Required FKs (non-nullable in schema) — only set if a truthy value is provided
        const requiredFks = ['unit_id', 'category_id'] as const;
        for (const field of requiredFks) {
            const val = (data as any)[field];
            if (val) updateData[field] = val;          // only set when there's a real ID
        }
        // Optional FKs (nullable in schema) — set to null when empty/falsy
        const optionalFks = ['subcategory_id', 'tax_id', 'supplier_id', 'brand_id', 'color_id', 'size_id'] as const;
        for (const field of optionalFks) {
            if ((data as any)[field] !== undefined) {
                updateData[field] = (data as any)[field] || null;
            }
        }

        console.log('📦 Product update payload:', JSON.stringify(updateData, null, 2));

        try {
            return await prisma.product.update({
                where: { id },
                data: updateData,
                include: {
                    unit: true,
                    category: true,
                    subcategory: true,
                    tax: true,
                    supplier: true,
                    brand: true,
                    color: true,
                    size: true,
                    ProductImage: { select: { id: true, image: true } },
                },
            });
        } catch (error: any) {
            // If FK constraint fails, give a friendly message
            if (error?.code === 'P2003') {
                const field = error?.meta?.field_name || 'unknown';
                throw new AppError(400, `Invalid reference for ${field}. The related record does not exist.`);
            }
            if (error?.code === 'P2025') {
                throw new AppError(404, 'Product not found');
            }
            throw error;
        }
    }

    private buildUpdateRelationsWithUnknownEntries(data: UpdateProductInput, unknownEntries: Record<string, string>) {
        const relations: Record<string, { connect: { id: string } }> = {};
        
        // Map of field names to their corresponding model names
        const fieldToModel: Record<string, string> = {
            'unit_id': 'unit',
            'category_id': 'category',
            'tax_id': 'tax',
            'supplier_id': 'supplier',
            'brand_id': 'brand',
            'color_id': 'color',
            'size_id': 'size',
            'subcategory_id': 'subcategory'
        };

        // Process each field that is provided in the update
        for (const [field, modelName] of Object.entries(fieldToModel)) {
            const value = (data as any)[field];
            if (value !== undefined) { // Only process fields that are explicitly provided
                const relationName = field.split('_')[0];
                
                if (value) {
                    // Use provided ID - will be verified in verifyAndFixRelations
                    relations[relationName] = { connect: { id: value } };
                    console.log(`✅ Using provided ${relationName} with ID: ${value}`);
                } else {
                    // Use unknown entry for null/empty values
                    const unknownId = unknownEntries[modelName];
                    relations[relationName] = { connect: { id: unknownId } };
                    console.log(`✅ Using unknown ${relationName} with ID: ${unknownId}`);
                }
            }
        }

        return relations;
    }

    async toggleProductStatus(id: string) {
        const product = await this.getProductById(id);
        return prisma.product.update({
            where: { id },
            data: { is_active: !product.is_active },
        });
    }

    async deleteProduct(id: string) {
        // Confirm existence first so we return a clean 404 instead of a
        // generic Prisma P2025.
        const product = await this.getProductById(id);

        // The Product row has many relations with ON DELETE RESTRICT. We walk
        // them in dependency order inside a transaction so a single failure
        // rolls everything back. Missing any one of these causes a P2003 FK
        // violation at the final product.delete() — e.g. Purchase was added
        // by the new Stock In flow and was not in the original cleanup list.
        await prisma.$transaction(async (tx) => {
            await tx.productImage.deleteMany({ where: { product_id: id } });
            await tx.stockMovement.deleteMany({ where: { product_id: id } });
            await tx.stockAdjustment.deleteMany({ where: { product_id: id } });
            await tx.transfer.deleteMany({ where: { product_id: id } });
            await tx.stock.deleteMany({ where: { product_id: id } });
            await tx.saleItem.deleteMany({ where: { product_id: id } });
            await tx.purchase.deleteMany({ where: { product_id: id } });
            await tx.purchaseOrderItem.deleteMany({ where: { product_id: id } });
            await tx.orderItem.deleteMany({ where: { product_id: id } });
            await tx.product.delete({ where: { id } });
        }, { maxWait: 20000, timeout: 30000 });

        return product;
    }

    async listProducts({
        page = 1,
        limit = 10,
        search,
        category_id,
        subcategory_id,
        is_active,
        display_on_pos,
        display_on_website,
        is_featured,
        stock_status,
        branch_id,
        fetchAll = false,
    }: {
        page?: number;
        limit?: number;
        search?: string;
        category_id?: string;
        subcategory_id?: string;
        // Both flags are OPT-IN filters now. Defaulting them to `true` made
        // inactive products invisible from the admin Products tab, which the
        // user perceived as deletion. Callers that genuinely want only
        // active / POS-visible products (POS sale screen, website API)
        // must pass these explicitly.
        is_active?: boolean;
        display_on_pos?: boolean;
        display_on_website?: boolean;
        is_featured?: boolean;
        stock_status?: 'out' | 'low';
        branch_id?: string;
        fetchAll?: boolean;
    }) {
        const where: Prisma.ProductWhereInput = {};

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (category_id) {
            where.category_id = category_id;
        }

        if (subcategory_id) {
            where.subcategory_id = subcategory_id;
        }

        if (is_active !== undefined) {
            where.is_active = is_active;
        }

        if (display_on_pos !== undefined) {
            where.display_on_pos = display_on_pos;
        }

        if (display_on_website !== undefined) {
            where.display_on_website = display_on_website;
        }

        if (is_featured !== undefined) {
            where.is_featured = is_featured;
        }

        if (stock_status === 'out') {
            where.NOT = { stock: { some: { current_quantity: { gt: 0 } } } };
        } else if (stock_status === 'low') {
            where.stock = {
                some: {
                    current_quantity: { gt: 0 },
                    minimum_quantity: { gt: 0 },
                },
            };
        }

        const { page: pageNumber, limit: normalizedLimit } = parsePagination({ page, limit });
        const pageSize = fetchAll ? MAX_LIMIT : normalizedLimit;

        const minimalSelect: Prisma.ProductSelect = {
            id: true,
            name: true,
            sku: true,
            code: true,
            pct_or_hs_code: true,
            purchase_rate: true,
            sales_rate_exc_dis_and_tax: true,
            sales_rate_inc_dis_and_tax: true,
            discount_amount: true,
            is_active: true,
            display_on_pos: true,
            display_on_website: true,
            is_featured: true,
            created_at: true,
            updated_at: true,
            category: {
                select: {
                    id: true,
                    name: true,
                },
            },
            subcategory: {
                select: {
                    id: true,
                    name: true,
                },
            },
            unit: {
                select: {
                    id: true,
                    name: true,
                },
            },
            ProductImage: {
                select: {
                    image: true,
                },
            },
            stock: branch_id
                ? {
                      where: { branch_id },
                      select: {
                          current_quantity: true,
                          reserved_quantity: true,
                          minimum_quantity: true,
                          maximum_quantity: true,
                      },
                  }
                : {
                      select: {
                          current_quantity: true,
                          reserved_quantity: true,
                          minimum_quantity: true,
                          maximum_quantity: true,
                          branch_id: true,
                      },
                  },
            _count: {
                select: { order_items: true },
            },
        };

        const detailedSelect: Prisma.ProductSelect = {
            ...minimalSelect,
            description: true,
            tax_id: true,
            category_id: true,
            subcategory_id: true,
            supplier_id: true,
            brand_id: true,
            color_id: true,
            size_id: true,
            brand: {
                select: {
                    id: true,
                    name: true,
                },
            },
            supplier: {
                select: {
                    id: true,
                    name: true,
                },
            },
            color: {
                select: {
                    id: true,
                    name: true,
                },
            },
            size: {
                select: {
                    id: true,
                    name: true,
                },
            },
            tax: {
                select: {
                    id: true,
                    name: true,
                    percentage: true,
                },
            },
        };

        const select = detailedSelect;

        const fetchPage = async (pageNumber: number) =>
            prisma.product.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip: (pageNumber - 1) * pageSize,
                take: pageSize,
                select,
            });

        const total = await prisma.product.count({ where });
        const products = await fetchPage(fetchAll ? 1 : pageNumber);

        const mapped = products.map((p) => {
            let currentStock: Prisma.Decimal = new Prisma.Decimal(0);
            let reservedStock: Prisma.Decimal = new Prisma.Decimal(0);
            let minimumStock: Prisma.Decimal = new Prisma.Decimal(0);
            let maximumStock: Prisma.Decimal = new Prisma.Decimal(0);

            const rawStock = (p as any).stock;
            const rawCount = (p as any)._count;

            if (branch_id && rawStock && Array.isArray(rawStock) && rawStock.length > 0) {
                const stockData = rawStock[0];
                currentStock = stockData.current_quantity || new Prisma.Decimal(0);
                reservedStock = stockData.reserved_quantity || new Prisma.Decimal(0);
                minimumStock = stockData.minimum_quantity || new Prisma.Decimal(0);
                maximumStock = stockData.maximum_quantity || new Prisma.Decimal(0);
            } else if (rawStock && Array.isArray(rawStock)) {
                rawStock.forEach((stockItem: any) => {
                    currentStock = currentStock.plus(stockItem.current_quantity || 0);
                    reservedStock = reservedStock.plus(stockItem.reserved_quantity || 0);
                    minimumStock = minimumStock.plus(stockItem.minimum_quantity || 0);
                    maximumStock = maximumStock.plus(stockItem.maximum_quantity || 0);
                });
            }

            return {
                ...p,
                current_stock: asNumber(currentStock),
                reserved_stock: asNumber(reservedStock),
                available_stock: asNumber(currentStock.minus(reservedStock)),
                minimum_stock: asNumber(minimumStock),
                maximum_stock: asNumber(maximumStock),
                order_count: rawCount?.order_items ?? 0,
            };
        });

        return {
            data: mapped,
            meta: {
                ...paginationMeta(total, fetchAll ? 1 : pageNumber, pageSize),
                fetchAll: false,
            },
        };
    }

    /**
     * Slim, unpaginated catalog for the POS selling screen.
     *
     * Returns only the fields the sale grid + add-to-cart need — no images,
     * description, brand/supplier/color/size/tax joins or order counts. This is
     * fetched once per session by the client and filtered in memory, so keeping
     * the row small keeps the whole-catalog payload cheap.
     */
    async getPosCatalog({ branch_id }: { branch_id?: string } = {}) {
        const rows = await prisma.product.findMany({
            where: { is_active: true, display_on_pos: true },
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                code: true,
                sku: true,
                purchase_rate: true,
                sales_rate_exc_dis_and_tax: true,
                sales_rate_inc_dis_and_tax: true,
                discount_amount: true,
                min_qty: true,
                max_qty: true,
                is_active: true,
                display_on_pos: true,
                is_batch: true,
                non_inventory_item: true,
                is_deal: true,
                is_featured: true,
                is_loose_item: true,
                updated_at: true,
                category: { select: { id: true, name: true } },
                subcategory: { select: { id: true, name: true } },
                unit: { select: { id: true, name: true } },
                stock: branch_id
                    ? {
                          where: { branch_id },
                          select: {
                              current_quantity: true,
                              reserved_quantity: true,
                              minimum_quantity: true,
                              maximum_quantity: true,
                          },
                      }
                    : {
                          select: {
                              current_quantity: true,
                              reserved_quantity: true,
                              minimum_quantity: true,
                              maximum_quantity: true,
                              branch_id: true,
                          },
                      },
            },
        });

        const data = rows.map((p) => {
            let current = new Prisma.Decimal(0);
            let reserved = new Prisma.Decimal(0);
            let minimum = new Prisma.Decimal(0);
            let maximum = new Prisma.Decimal(0);

            const stock = (p as any).stock as any[] | undefined;
            if (Array.isArray(stock)) {
                for (const s of stock) {
                    current = current.plus(s.current_quantity || 0);
                    reserved = reserved.plus(s.reserved_quantity || 0);
                    minimum = minimum.plus(s.minimum_quantity || 0);
                    maximum = maximum.plus(s.maximum_quantity || 0);
                }
            }

            const { stock: _drop, ...rest } = p as any;
            return {
                ...rest,
                current_stock: asNumber(current),
                reserved_stock: asNumber(reserved),
                available_stock: asNumber(current.minus(reserved)),
                minimum_stock: asNumber(minimum),
                maximum_stock: asNumber(maximum),
            };
        });

        return { data, meta: { total: data.length } };
    }

    /**
     * Cost history for one product from its purchase (goods-received) records,
     * with a running weighted-average cost after each receipt. This is the
     * "what have we been paying for this" view.
     */
    async getProductCostHistory(productId: string) {
        const product = await prisma.product.findUnique({
            where: { id: productId },
            select: { id: true, name: true, sku: true, code: true, purchase_rate: true },
        });
        if (!product) throw new AppError(404, 'Product not found');

        const purchases = await prisma.purchase.findMany({
            where: { product_id: productId },
            orderBy: { purchase_date: 'asc' },
            include: {
                supplier: { select: { id: true, name: true } },
                warehouse_branch: { select: { id: true, name: true } },
            },
        });

        let runningQty = 0;
        let runningValue = 0;
        const entries = purchases.map((p) => {
            const qty = asNumber(p.quantity);
            const unitCost = asNumber(p.cost_price);
            runningQty += qty;
            runningValue += qty * unitCost;
            const avg = runningQty > 0 ? runningValue / runningQty : unitCost;
            return {
                id: p.id,
                purchase_date: p.purchase_date,
                supplier: p.supplier,
                branch: p.warehouse_branch,
                quantity: qty,
                unit_cost: unitCost,
                line_total: qty * unitCost,
                invoice_ref: p.invoice_ref,
                running_qty: runningQty,
                weighted_avg_cost: avg,
            };
        });

        const last = entries[entries.length - 1];
        const first = entries[0];
        return {
            product: { ...product, purchase_rate: asNumber(product.purchase_rate) },
            summary: {
                receiptCount: entries.length,
                totalQty: runningQty,
                totalValue: runningValue,
                latestCost: last ? last.unit_cost : asNumber(product.purchase_rate),
                weightedAvgCost: last ? last.weighted_avg_cost : asNumber(product.purchase_rate),
                minCost: entries.length ? Math.min(...entries.map((e) => e.unit_cost)) : 0,
                maxCost: entries.length ? Math.max(...entries.map((e) => e.unit_cost)) : 0,
                firstCost: first ? first.unit_cost : 0,
            },
            entries: entries.reverse(),
        };
    }

    async getFeaturedProducts() {
        // Fetch featured products from the database
        let featuredProducts = await prisma.product.findMany({
            where: {
                is_featured: true,
                is_active: true,
                display_on_website: true,
            },
            orderBy: {
                created_at: "desc",
            },
            take: 10,
            include: {
                ProductImage: {
                    select: {
                        image: true,
                    },
                },
                category: {
                    select: { name: true }
                },
                subcategory: {
                    select: { name: true }
                },
            },
        });

        // If no featured products, return some active products as fallback
        if (featuredProducts.length === 0) {
            featuredProducts = await prisma.product.findMany({
                where: {
                    is_active: true,
                    display_on_website: true,
                },
                orderBy: {
                    created_at: "desc",
                },
                take: 10,
                include: {
                    ProductImage: {
                        select: {
                            image: true,
                        },
                    },
                    category: {
                        select: { name: true }
                    },
                    subcategory: {
                        select: { name: true }
                    },
                },
            });
        }

        return featuredProducts;
    }

    async getBestSellingProducts(limit = 10) {
        const startDate = startOfMonth(new Date());
        const endDate = new Date();

        const bestSellingActiveProductsThisMonth = await prisma.product.findMany({
            where: {
                is_active: true,
                display_on_website: true,
                order_items: {
                    some: {
                        created_at: {
                            gte: startDate,
                            lte: endDate,
                        },
                    },
                },
            },
            include: {
                _count: {
                    select: {
                        order_items: {
                            where: {
                                created_at: {
                                    gte: startDate,
                                    lte: endDate,
                                },
                            },
                        },
                    },
                },
            },
            orderBy: {
                order_items: {
                    _count: 'desc',
                },
            },
            take: limit,
        });

        return bestSellingActiveProductsThisMonth;
    }

    async getProductByNameSearch(name: string, limit?: number) {
        const products = await prisma.product.findMany({
            where: {
                name: {
                    contains: name,
                    mode: 'insensitive',
                },
                is_active: true,
                display_on_website: true,
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                unit: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                ProductImage: {
                    select: {
                        image: true,
                    },
                },
            },
            orderBy: {
                created_at: "desc",
            },
            take: limit || 10,
        });

        return products;
    }

    private async getDefaultWarehouseBranchId(tx: Prisma.TransactionClient): Promise<string | null> {
        const warehouse = await tx.branch.findFirst({
            where: { branch_type: 'WAREHOUSE' },
            select: { id: true },
        });
        if (warehouse) return warehouse.id;
        const anyBranch = await tx.branch.findFirst({
            orderBy: { created_at: 'asc' },
            select: { id: true },
        });
        return anyBranch?.id ?? null;
    }

    private async applyOpeningStockFromBulk(
        tx: Prisma.TransactionClient,
        productId: string,
        data: { opening_stock?: number; min_qty?: number; purchase_rate?: number },
        createdBy?: string,
    ) {
        const qty = Number(data.opening_stock ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) return;

        const branchId = await this.getDefaultWarehouseBranchId(tx);
        if (!branchId) {
            console.warn('Bulk upload: no branch found — opening stock not applied');
            return;
        }

        const existing = await tx.stock.findUnique({
            where: {
                product_id_branch_id: { product_id: productId, branch_id: branchId },
            },
        });

        const previousQty = existing ? asNumber(existing.current_quantity) : 0;
        const newQty = existing
            ? addDecimal(existing.current_quantity, qty)
            : new Prisma.Decimal(qty);

        if (existing) {
            await tx.stock.update({
                where: {
                    product_id_branch_id: { product_id: productId, branch_id: branchId },
                },
                data: {
                    current_quantity: newQty,
                    minimum_quantity: new Prisma.Decimal(data.min_qty ?? 10),
                },
            });
        } else {
            await tx.stock.create({
                data: {
                    product_id: productId,
                    branch_id: branchId,
                    current_quantity: newQty,
                    minimum_quantity: new Prisma.Decimal(data.min_qty ?? 10),
                },
            });
        }

        await tx.stockMovement.create({
            data: {
                product_id: productId,
                branch_id: branchId,
                movement_type: 'PURCHASE',
                quantity_change: new Prisma.Decimal(qty),
                previous_qty: new Prisma.Decimal(previousQty),
                new_qty: newQty,
                unit_cost: data.purchase_rate
                    ? new Prisma.Decimal(data.purchase_rate)
                    : undefined,
                notes: 'Stock In Excel import — opening stock',
                created_by: createdBy ?? null,
                reference_type: 'bulk-upload',
            },
        });
    }

    async createProductFromBulkUpload(
        data: any,
        createdBy?: string,
    ): Promise<Product & {
        unit: any;
        category: any;
        subcategory: any;
        tax: any;
        supplier: any;
        brand: any;
        color: any;
        size: any;
    }> {
        // Check if product exists by SKU or name
        let existingProduct = null;
        
        if (data.sku) {
            existingProduct = await prisma.product.findUnique({
                where: { sku: data.sku },
                select: { id: true, code: true, sku: true }
            });
        }
        
        // If not found by SKU, try to find by name
        if (!existingProduct && data.name) {
            existingProduct = await prisma.product.findFirst({
                where: { 
                    name: {
                        equals: data.name,
                        mode: 'insensitive'
                    }
                },
                select: { id: true, code: true, sku: true }
            });
        }

        let productCode: string;
        if (existingProduct) {
            productCode = existingProduct.code;
        } else {
            const lastProduct = await prisma.product.findFirst({
                orderBy: { created_at: 'desc' },
                select: { code: true },
            });
            productCode = lastProduct ? (parseInt(lastProduct.code, 10) + 1).toString() : '1000';
        }

        // Start transaction for atomic operations
        return await prisma.$transaction(async (tx) => {
            console.log(existingProduct ? '🔄 Starting transaction for bulk product update...' : '🚀 Starting transaction for bulk product creation...');

            let sku: string | undefined = typeof data.sku === 'string' ? data.sku.trim() : undefined;
            if (sku) {
                if (!isNineDigitNumericSku(sku)) {
                    throw new AppError(400, 'SKU must be exactly 9 digits (numbers only) for barcode use');
                }
                if (!existingProduct) {
                    const clash = await tx.product.findUnique({
                        where: { sku },
                        select: { id: true },
                    });
                    if (clash) {
                        throw new AppError(400, 'Product with this SKU already exists');
                    }
                } else if (sku !== existingProduct.sku) {
                    const clash = await tx.product.findUnique({
                        where: { sku },
                        select: { id: true },
                    });
                    if (clash && clash.id !== existingProduct.id) {
                        throw new AppError(400, 'Product with this SKU already exists');
                    }
                }
            } else if (existingProduct) {
                sku = existingProduct.sku;
            } else {
                sku = await generateUniqueNumericSku(tx);
            }
            
            // Build product data
            const productData = existingProduct 
                ? this.buildUpdateProductData(data)
                : this.buildProductData(data, productCode);

            // Build relations using names from the sheet
            const relations = await this.buildRelationsFromNames(data, tx);
            console.log('📦 Relations built from names:', JSON.stringify(relations, null, 2));

            // Combine all data
            // For updates, don't include SKU if it's empty or not provided
            // For creates, always include SKU and code
            const finalData: any = {
                ...productData,
                ...(existingProduct ? {} : { sku, code: productCode }),
                ...relations
            };
            
            // Remove empty SKU from update data to avoid conflicts
            if (existingProduct && (!data.sku || data.sku === '')) {
                delete finalData.sku;
            }

            console.log('📤 Final data being sent to Prisma:');
            console.log(JSON.stringify(finalData, null, 2));

            // Update or create the product
            const product = existingProduct
                ? await tx.product.update({
                    where: { id: existingProduct.id },
                    data: finalData,
                    include: {
                        unit: true,
                        category: true,
                        subcategory: true,
                        tax: true,
                        supplier: true,
                        brand: true,
                        color: true,
                        size: true,
                    }
                })
                : await tx.product.create({
                    data: finalData,
                    include: {
                        unit: true,
                        category: true,
                        subcategory: true,
                        tax: true,
                        supplier: true,
                        brand: true,
                        color: true,
                        size: true,
                    }
                }) as Product & {
                    unit: any;
                    category: any;
                    subcategory: any;
                    tax: any;
                    supplier: any;
                    brand: any;
                    color: any;
                    size: any;
                };

            console.log(existingProduct ? `✅ Product updated successfully with ID: ${product.id}` : `✅ Product created successfully with ID: ${product.id}`);

            await this.applyOpeningStockFromBulk(tx, product.id, data, createdBy);

            return product;
        }, {
            maxWait: 20000, // 20 seconds
            timeout: 15000  // 15 seconds,
        });
    }

    private async buildRelationsFromNames(data: any, tx: any) {
        const relations: Record<string, { connect: { id: string } }> = {};
        
        // Map of field names to their corresponding model names and code prefixes
        const fieldToModel: Record<string, { model: string, codePrefix: string }> = {
            'unit_name': { model: 'unit', codePrefix: 'UNIT' },
            'category_name': { model: 'category', codePrefix: 'CAT' },
            'tax_name': { model: 'tax', codePrefix: 'TAX' },
            'supplier_name': { model: 'supplier', codePrefix: 'SUP' },
            'brand_name': { model: 'brand', codePrefix: 'BRA' },
            'color_name': { model: 'color', codePrefix: 'COL' },
            'size_name': { model: 'size', codePrefix: 'SIZ' },
            'subcategory_name': { model: 'subcategory', codePrefix: 'SUB' }
        };

        // Process each field
        for (const [fieldName, modelInfo] of Object.entries(fieldToModel)) {
            const value = data[fieldName];
            const relationName = modelInfo.model;
            
            if (value) {
                // Use name-based lookup and creation
                const entryId = await this.getOrCreateEntryByName(modelInfo.model, value, modelInfo.codePrefix, tx);
                relations[relationName] = { connect: { id: entryId } };
                console.log(`✅ Using ${relationName} with name: "${value}" and ID: ${entryId}`);
            } else {
                // Use unknown entry
                const unknownId = await this.getOrCreateUnknownEntry(modelInfo.model, modelInfo.codePrefix, tx);
                relations[relationName] = { connect: { id: unknownId } };
                console.log(`✅ Using unknown ${relationName} with ID: ${unknownId}`);
            }
        }

        console.log('📦 Final relations object from names:', JSON.stringify(relations, null, 2));
        return relations;
    }

    async deleteAllProducts(): Promise<{ 
        deletedCount: number; 
        deletedImages: number; 
        deletedStocks: number;
        deletedStockMovements: number;
        deletedSaleItems: number;
        deletedPurchaseOrderItems: number;
        deletedOrderItems: number;
    }> {
        // Delete all products and their related records in a transaction
        // Order matters due to foreign key constraints (ON DELETE RESTRICT)
        return await prisma.$transaction(async (tx) => {
            // 1. Delete ProductImage records (no FK constraint issues)
            const deletedImages = await tx.productImage.deleteMany({});
            
            // 2. Delete StockMovement records (references Product with ON DELETE RESTRICT)
            const deletedStockMovements = await tx.stockMovement.deleteMany({});
            
            // 3. Delete Stock records (references Product with ON DELETE RESTRICT)
            const deletedStocks = await tx.stock.deleteMany({});
            
            // 4. Delete SaleItem records (references Product with ON DELETE RESTRICT)
            const deletedSaleItems = await tx.saleItem.deleteMany({});
            
            // 5. Delete PurchaseOrderItem records (references Product with ON DELETE RESTRICT)
            const deletedPurchaseOrderItems = await tx.purchaseOrderItem.deleteMany({});
            
            // 6. Delete OrderItem records (references Product with ON DELETE RESTRICT)
            const deletedOrderItems = await tx.orderItem.deleteMany({});
            
            // 7. Finally, delete all Products
            const deletedProducts = await tx.product.deleteMany({});
            
            return {
                deletedCount: deletedProducts.count,
                deletedImages: deletedImages.count,
                deletedStocks: deletedStocks.count,
                deletedStockMovements: deletedStockMovements.count,
                deletedSaleItems: deletedSaleItems.count,
                deletedPurchaseOrderItems: deletedPurchaseOrderItems.count,
                deletedOrderItems: deletedOrderItems.count,
            };
        });
    }
}