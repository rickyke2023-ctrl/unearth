from __future__ import annotations


class UnearthError(Exception):
    code = "UNEARTH_ERROR"
    status_code = 400

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class DiskNotMountedError(UnearthError):
    code = "DISK_NOT_MOUNTED"


class ScanNotCompletedError(UnearthError):
    code = "SCAN_NOT_COMPLETED"


class PhotoNotFoundError(UnearthError):
    code = "PHOTO_NOT_FOUND"
    status_code = 404


class PreviewNotReadyError(UnearthError):
    code = "PREVIEW_NOT_READY"
    status_code = 202


class StagingError(UnearthError):
    code = "STAGING_ERROR"


class InvalidDecisionError(UnearthError):
    code = "INVALID_DECISION"

