/**
 * 로깅 유틸리티
 * Winston 기반 구조화된 로깅
 */

import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// 커스텀 로그 포맷
const logFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
});

// 로거 인스턴스 생성
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
    ),
    transports: [
        // 콘솔 출력 (개발 환경)
        new winston.transports.Console({
            format: combine(
                colorize(),
                logFormat
            )
        })
    ],
    // 예외 처리
    exceptionHandlers: [
        new winston.transports.Console()
    ],
    rejectionHandlers: [
        new winston.transports.Console()
    ]
});

// 프로덕션 환경에서 파일 로깅 추가 (선택적)
if (process.env.NODE_ENV === 'production' && process.env.LOG_FILE === 'true') {
    logger.add(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error'
    }));
    logger.add(new winston.transports.File({
        filename: 'logs/combined.log'
    }));
}

export default logger;
