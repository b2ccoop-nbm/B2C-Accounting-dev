-- Expand accounting staff roles (Treasurer, Accountant, GM, Chairperson, etc.)
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'GENERAL_MANAGER';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'CHAIRMAN';
