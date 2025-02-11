import { Request, Response } from 'express';
import { FederationPartnerService, PartnerConfig } from '../services/FederationPartnerService';
import { OAuthClientService, OAuthClientConfig } from '../services/OAuthClientService';
import { MetadataValidationService } from '../services/MetadataValidationService';
import { SessionManagementService } from '../services/SessionManagementService';
import { LoggerService } from '../services/LoggerService';

export class PartnerController {
    private static instance: PartnerController;
    private federationService: FederationPartnerService;
    private oauthService: OAuthClientService;
    private metadataValidator: MetadataValidationService;
    private sessionManager: SessionManagementService;
    private logger: LoggerService;

    private constructor() {
        this.federationService = FederationPartnerService.getInstance();
        this.oauthService = OAuthClientService.getInstance();
        this.metadataValidator = MetadataValidationService.getInstance();
        this.sessionManager = SessionManagementService.getInstance();
        this.logger = LoggerService.getInstance();
    }

    public static getInstance(): PartnerController {
        if (!PartnerController.instance) {
            PartnerController.instance = new PartnerController();
        }
        return PartnerController.instance;
    }

    async onboardPartner(req: Request, res: Response): Promise<void> {
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
                res.status(400).json({
                    error: 'Invalid partner metadata',
                    validationResult
                });
                return;
            }

            // Create OAuth client
            const oauthClient = await this.oauthService.createOAuthClient(oauthConfig);

            // Onboard federation partner
            const partnerConnection = await this.federationService.onboardPartner({
                ...partnerConfig,
                oauthClientId: oauthClient.clientId
            });

            this.logger.info('Partner onboarded successfully', {
                partnerId: partnerConfig.partnerId,
                connectionId: partnerConnection.id
            });

            res.status(200).json({
                message: 'Partner onboarded successfully',
                oauthClient,
                partnerConnection
            });
        } catch (error) {
            this.logger.error('Partner onboarding error', { error });
            res.status(500).json({
                error: 'Partner onboarding failed',
                details: error.message
            });
        }
    }

    async validatePartnerMetadata(req: Request, res: Response): Promise<void> {
        try {
            const { metadataUrl } = req.body;
            
            if (!metadataUrl) {
                res.status(400).json({
                    error: 'Metadata URL is required'
                });
                return;
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
            res.status(500).json({
                error: 'Metadata validation failed',
                details: error.message
            });
        }
    }

    async getPartnerDetails(req: Request, res: Response): Promise<void> {
        try {
            const { partnerId } = req.params;
            const partner = await this.federationService.getPartner(partnerId);

            if (!partner) {
                res.status(404).json({
                    error: 'Partner not found'
                });
                return;
            }

            const oauthClient = await this.oauthService.getOAuthClient(partner.oauthClientId);
            const sessionStats = await this.sessionManager.getPartnerSessionStats(partnerId);

            res.status(200).json({
                partner,
                oauthClient,
                sessionStats
            });
        } catch (error) {
            this.logger.error('Error retrieving partner details', { error });
            res.status(500).json({
                error: 'Failed to retrieve partner details',
                details: error.message
            });
        }
    }

    async updatePartner(req: Request, res: Response): Promise<void> {
        try {
            const { partnerId } = req.params;
            const updateConfig = req.body;

            // Validate update config
            if (updateConfig.metadata?.url) {
                const validationResult = await this.metadataValidator.validateMetadata(
                    updateConfig.metadata.url
                );

                if (!validationResult.valid) {
                    res.status(400).json({
                        error: 'Invalid metadata in update',
                        validationResult
                    });
                    return;
                }
            }

            const updatedPartner = await this.federationService.updatePartner(
                partnerId,
                updateConfig
            );

            this.logger.info('Partner updated successfully', { partnerId });
            res.status(200).json(updatedPartner);
        } catch (error) {
            this.logger.error('Partner update error', { error });
            res.status(500).json({
                error: 'Failed to update partner',
                details: error.message
            });
        }
    }

    async deactivatePartner(req: Request, res: Response): Promise<void> {
        try {
            const { partnerId } = req.params;
            const { reason } = req.body;

            await this.federationService.deactivatePartner(partnerId, reason);
            await this.sessionManager.terminatePartnerSessions(partnerId);

            this.logger.info('Partner deactivated', { partnerId, reason });
            res.status(200).json({
                message: 'Partner deactivated successfully'
            });
        } catch (error) {
            this.logger.error('Partner deactivation error', { error });
            res.status(500).json({
                error: 'Failed to deactivate partner',
                details: error.message
            });
        }
    }

    async reactivatePartner(req: Request, res: Response): Promise<void> {
        try {
            const { partnerId } = req.params;
            
            // Validate partner status before reactivation
            const validationResult = await this.federationService.validatePartnerStatus(partnerId);
            
            if (!validationResult.canReactivate) {
                res.status(400).json({
                    error: 'Partner cannot be reactivated',
                    reasons: validationResult.reasons
                });
                return;
            }

            await this.federationService.reactivatePartner(partnerId);

            this.logger.info('Partner reactivated', { partnerId });
            res.status(200).json({
                message: 'Partner reactivated successfully'
            });
        } catch (error) {
            this.logger.error('Partner reactivation error', { error });
            res.status(500).json({
                error: 'Failed to reactivate partner',
                details: error.message
            });
        }
    }

    private validatePartnerConfig(config: PartnerConfig): void {
        const requiredFields = ['partnerId', 'partnerName', 'federationType', 'metadata'];
        for (const field of requiredFields) {
            if (!config[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        if (!['SAML', 'OIDC'].includes(config.federationType)) {
            throw new Error('Invalid federation type. Must be either SAML or OIDC');
        }
    }

    private validateOAuthConfig(config: OAuthClientConfig): void {
        const requiredFields = ['clientId', 'name', 'grantTypes', 'redirectUris'];
        for (const field of requiredFields) {
            if (!config[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        const validGrantTypes = ['authorization_code', 'client_credentials', 'refresh_token'];
        for (const grant of config.grantTypes) {
            if (!validGrantTypes.includes(grant)) {
                throw new Error(`Invalid grant type: ${grant}`);
            }
        }
    }
}

export default PartnerController;