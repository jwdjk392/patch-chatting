export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    
    constructor({
        statusCode = 500,
        code = "INTERNAL_ERROR",
        message = "Internal server error",
        cause,
    }: {
        statusCode?: number;
        code?: string;
        message?: string;
        cause?: unknown;
    } = {}) {
        super(message, { cause });
        this.name = "AppError";
        this.statusCode = statusCode;
        this.code = code;
    }
}

export class DbUniqueError extends Error {
    constructor(
        public readonly field: string,
        message: string
    ) {
        super(message);
        this.name = "ERR_DB_UNIQUE"
    }
}