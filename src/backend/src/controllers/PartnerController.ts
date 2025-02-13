import { Request, Response } from 'express';
import { FederationPartnerService, PartnerConfig } from '../services/FederationPartnerService';
import { OAuthClientService, OAuthClientConfig } from '../services/OAuthClientService';
import { MetadataValidationService } from '../services/MetadataValidationService';
import { SessionManagementService } from '../services/SessionManagementService';
import { LoggerService } from '../services/LoggerService';
import { AuthenticatedRequest, AuthError } from '../types';
import { SAML2Client } from '../services/SAML2Client';
import { FederationMonitoringService } from '../services/FederationMonitoringService';

export class PartnerController {
    private static instance: PartnerController;
    private federationService: FederationPartnerService;
    private oauthService: OAuthClientService;
    private metadataValidator: MetadataValidationService;
    private sessionManager: SessionManagementService;
    private logger: LoggerService;
    private samlClient: SAML2Client;
    private monitoringService: FederationMonitoringService;

    private constructor() {
        this.federationService = FederationPartnerService.getInstance();
        this.oauthService = OAuthClientService.getInstance();
        this.metadataValidator = MetadataValidationService.getInstance();
        this.sessionManager = SessionManagementService.getInstance();
        this.logger = LoggerService.getInstance();
        this.samlClient = SAML2Client.getInstance();
        this.monitoringService = FederationMonitoringService.getInstance();
    }

    public static getInstance(): PartnerController {
        if (!PartnerController.instance) {
            PartnerController.instance = new PartnerController();
        }
        return PartnerController.instance;
    }

    async onboardPartner(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        try {
            const { partnerConfig, oauthConfig } = req.body;

            // Validate request body
            this.validatePartnerConfig(partnerConfig);
            this.validateOAuthConfig(oauthConfig);

            // Validate metadata first
            const validationResult = await this.metadataValidator.validateMetadata(
                partnerConfig.metadata.url
            );

            if (!validationResult.valid) {
                this.logger.error('Invalid partner metadata', { validationResult });
                const error = new Error('Invalid partner metadata') as AuthError;
                error.statusCode = 400;
                error.details = validationResult.errors;
                throw error;
            }

            // Create OAuth client
            const oauthClient = await this.oauthService.createOAuthClient({
                ...oauthConfig,
                partnerId: partnerConfig.partnerId
            });

            // Onboard federation partner
            const partnerConnection = await this.federationService.onboardPartner({
                ...partnerConfig,
                oauthClientId: oauthClient.clientId,
                createdBy: req.userAttributes.uniqueIdentifier
            });

            // Initialize monitoring
            await this.monitoringService.updatePartnerHealth(partnerConfig.partnerId, {
                partnerId: partnerConfig.partnerId,
                status: 'healthy',
                lastChecked: new Date(),
                responseTime: 0,
                errorCount: 0,
                successRate: 100
            });

            this.logger.info('Partner onboarded successfully', {
                partnerId: partnerConfig.partnerId,
                connectionId: partnerConnection.partnerId,
                duration: Date.now() - startTime
            });

            res.status(201).json({
                message: 'Partner onboarded successfully',
                oauthClient,
                partnerConnection
            });
        } catch (error) {
            this.logger.error('Partner onboarding error', { error });
            const err = error as Error;
            res.status((error as AuthError).statusCode || 500).json({
                error: err.message || 'Partner onboarding failed',
                code: (error as AuthError).code,
                details: (error as AuthError).details
            });
        }
    }

    async validatePartnerMetadata(req: Request, res: Response): Promise<void> {
        try {
            const { metadataUrl } = req.body;
            
            if (!metadataUrl) {
                const error = new Error('Metadata URL is required') as AuthError;
                error.statusCode = 400;
                throw error;
            }

            const validationResult = await this.metadataValidator.validateMetadata(metadataUrl);

            if (!validationResult.valid) {
                res.status(400).json({
                    valid: false,
                    errors: validationResult.errors,
                    warnings: validationResult.warnings
                });
                return;
            }

            this.logger.info('Metadata validation successful', { metadataUrl });
            res.status(200).json(validationResult);
        } catch (error) {
            this.logger.error('Metadata validation error', { error });
            res.status((error as AuthError).statusCode || 500).json({
                error: (error as Error).message || 'Metadata validation failed',
                details: (error as AuthError).details
            });
        }
    }

    async getPartnerDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { partnerId } = req.params;
            const partner = await this.federationService.getPartner(partnerId);

            if (!partner) {
                const error = new Error('Partner not found') as AuthError;
                error.statusCode = 404;
                throw error;
            }

            const [oauthClient, sessionStats, healthMetrics] = await Promise.all([
                this.oauthService.getOAuthClient(partner.oauthClientId),
                this.sessionManager.getPartnerSessionStats(partnerId),
                this.monitoringService.getPartnerMetrics(partnerId)
            ]);

            res.status(200).json({
                partner,
                oauthClient,
                sessionStats,
                healthMetrics
            });
        } catch (error) {
            this.logger.error('Error retrieving partner details', { error });
            res.status((error as AuthError).statusCode || 500).json({
                error: (error as Error).message || 'Failed to retrieve partner details',
                details: (error as AuthError).details
            });
        }
    }

    async updatePartner(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { partnerId } = req.params;
            const updateConfig = req.body;

            const existingPartner = await this.federationService.getPartner(partnerId);
            if (!existingPartner) {
                const error = new Error('Partner not found') as AuthError;
                error.statusCode = 404;
                throw error;
            }

            // Validate update config
            if (updateConfig.metadata?.url) {
                const validationResult = await this.metadataValidator.validateMetadata(
                    updateConfig.metadata.url
                );

                if (!validationResult.valid) {
                    const error = new Error('Invalid metadata in update') as AuthError;
                    error.statusCode = 400;
                    error.details = validationResult.errors;
                    throw error;
                }
            }

            const updatedPartner = await this.federationService.updatePartner(
                partnerId,
                {
                    ...updateConfig,
                    lastModifiedBy: req.userAttributes.uniqueIdentifier
                }
            );

            // Update OAuth client if necessary
            if (updateConfig.oauth) {
                await this.oauthService.updateOAuthClient(
                    existingPartner.oauthClientId,
                    updateConfig.oauth
                );
            }

            this.logger.info('Partner updated successfully', { 
                partnerId,
                updatedBy: req.userAttributes.uniqueIdentifier
            });

            res.status(200).json(updatedPartner);
        } catch (error) {
            this.logger.error('Partner update error', { error });
            res.status((error as AuthError).statusCode || 500).json({
                error: (error as Error).message || 'Failed to update partner',
                details: (error as AuthError).details
            });
        }
    }

    async deactivatePartner(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { partnerId } = req.params;
            const { reason } = req.body;

            if (!reason) {
                const error = new Error('Deactivation reason is required') as AuthError;
                error.statusCode = 400;
                throw error;
            }

            await this.federationService.deactivatePartner(partnerId, {
                reason,
                deactivatedBy: req.userAttributes.uniqueIdentifier
            });

            // Terminate all active sessions
            await this.sessionManager.terminatePartnerSessions(partnerId);

            // Update monitoring status
            await this.monitoringService.updatePartnerHealth(partnerId, {
                partnerId,
                status: 'down',
                lastChecked: new Date(),
                responseTime: 0,
                errorCount: 0,
                successRate: 0
            });

            this.logger.info('Partner deactivated', {
                partnerId,
                reason,
                deactivatedBy: req.userAttributes.uniqueIdentifier
            });

            res.status(200).json({
                message: 'Partner deactivated successfully'
            });
        } catch (error) {
            this.logger.error('Partner deactivation error', { error });
            res.status((error as AuthError).statusCode || 500).json({
                error: (error as Error).message || 'Failed to deactivate partner',
                details: (error as AuthError).details
            });
        }
    }

    async reactivatePartner(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { partnerId } = req.params;
            
            // Validate partner status before reactivation
            const validationResult = await this.federationService.validatePartnerStatus(partnerId);
            
            if (!validationResult.canReactivate) {
                const error = new Error('Partner cannot be reactivated') as AuthError;
                error.statusCode = 400;
                error.details = validationResult.reasons;
                throw error;
            }

            await this.federationService.reactivatePartner(partnerId, {
                reactivatedBy: req.userAttributes.uniqueIdentifier
            });

            // Initialize new health monitoring
            await this.monitoringService.updatePartnerHealth(partnerId, {
                partnerId,
                status: 'healthy',
                lastChecked: new Date(),
                responseTime: 0,
                errorCount: 0,
                successRate: 100
            });

            this.logger.info('Partner reactivated', {
                partnerId,
                reactivatedBy: req.userAttributes.uniqueIdentifier
            });

            res.status(200).json({
                message: 'Partner reactivated successfully'
            });
        } catch (error) {
            this.logger.error('Partner reactivation error', { error });
            res.status((error as AuthError).statusCode || 500).json({
                error: (error as Error).message || 'Failed to reactivate partner',
                details: (error as AuthError).details
            });
        }
    }

    private validatePartnerConfig(config: PartnerConfig): void {
        const requiredFields = [
            'partnerId',
            'partnerName',
            'federationType',
            'metadata'
        ];

        for (const field of requiredFields) {
            if (!(field in config)) {
                const error = new Error(`Missing required field: ${field}`) as AuthError;
                error.statusCode = 400;
                throw error;
            }
        }

        if (!['SAML', 'OIDC'].includes(config.federationType)) {
            const error = new Error('Invalid federation type. Must be either SAML or OIDC') as AuthError;
            error.statusCode = 400;
            throw error;
        }
    }

    private validateOAuthConfig(config: OAuthClientConfig): void {
        const requiredFields = [
            'clientId',
            'name',
            'grantTypes',
            'redirectUris'
        ];

        for (const field of requiredFields) {
            if (!(field in config)) {
                const error = new Error(`Missing required field: ${field}`) as AuthError;
                error.statusCode = 400;
                throw error;
            }
        }

        const validGrantTypes = [
            'authorization_code',
            'client_credentials',
            'refresh_token'
        ];

        for (const grant of config.grantTypes) {
            if (!validGrantTypes.includes(grant)) {
                const error = new Error(`Invalid grant type: ${grant}`) as AuthError;
                error.statusCode = 400;
                throw error;
            }
        }
    }
}

export default PartnerController;