// src/wordpress/plugins/dive25-integration/dive25-integration.php

<?php
/*
Plugin Name: DIVE25 Integration
Description: Integrates WordPress with DIVE25 NATO document access system
Version: 1.0
*/

// Prevent direct access to this file
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants for Docker environment
define('DIVE25_PINGFED_URL', getenv('PINGFED_URL') ?: 'https://pingfederate:9031');
define('DIVE25_OPA_URL', getenv('OPA_URL') ?: 'http://localhost:8181');
define('DIVE25_ENV', getenv('DIVE25_ENV') ?: 'development');

class DIVE25_Integration {
    private static $instance = null;
    private $ping_federate;
    private $opa_service;

    public static function get_instance() {
        if (self::$instance == null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        $this->load_dependencies();
        $this->init_services();
        $this->setup_hooks();
    }

    private function load_dependencies() {
        // Load required classes
        require_once plugin_dir_path(__FILE__) . 'includes/class-ping-federate.php';
        require_once plugin_dir_path(__FILE__) . 'includes/class-opa-integration.php';
        require_once plugin_dir_path(__FILE__) . 'includes/class-security-metadata.php';
    }

    private function init_services() {
        // Initialize services with Docker-aware configuration
        $this->ping_federate = new DIVE25_PingFederate([
            'base_url' => DIVE25_PINGFED_URL,
            'client_id' => getenv('PINGFED_CLIENT_ID'),
            'client_secret' => getenv('PINGFED_CLIENT_SECRET')
        ]);

        $this->opa_service = new DIVE25_OPA_Integration([
            'base_url' => DIVE25_OPA_URL
        ]);
    }

    private function setup_hooks() {
        // Authentication hooks
        add_action('init', [$this, 'start_session']);
        add_filter('authenticate', [$this, 'authenticate_user'], 10, 3);
        add_filter('determine_current_user', [$this, 'determine_current_user']);

        // Content security hooks
        add_action('add_meta_boxes', [$this, 'add_security_meta_boxes']);
        add_action('save_post', [$this, 'save_security_metadata']);
        add_filter('the_content', [$this, 'filter_content_by_clearance']);
        
        // Admin interface hooks
        if (is_admin()) {
            add_action('admin_menu', [$this, 'add_admin_menu']);
            add_action('admin_init', [$this, 'register_settings']);
        }
    }

    public function start_session() {
        if (!session_id()) {
            session_start();
        }
    }

    public function authenticate_user($user, $username, $password) {
        // Skip if already authenticated
        if ($user instanceof WP_User) {
            return $user;
        }

        try {
            // Get token from PingFederate OAuth flow
            $token = $_GET['access_token'] ?? $_SESSION['access_token'] ?? null;
            
            if (!$token) {
                // Redirect to PingFederate login if no token
                $this->ping_federate->redirect_to_login();
                exit;
            }

            // Validate token and get user attributes
            $user_info = $this->ping_federate->validate_token($token);
            
            if (!$user_info) {
                return null;
            }

            // Create or update WordPress user
            $user = $this->get_or_create_wp_user($user_info);
            
            // Store NATO attributes
            $this->update_user_security_attributes($user->ID, $user_info);
            
            // Store token in session
            $_SESSION['access_token'] = $token;
            
            return $user;

        } catch (Exception $e) {
            error_log('DIVE25 authentication error: ' . $e->getMessage());
            return null;
        }
    }

    private function update_user_security_attributes($user_id, $user_info) {
        update_user_meta($user_id, 'clearance_level', $user_info['clearance']);
        update_user_meta($user_id, 'country_affiliation', $user_info['countryOfAffiliation']);
        update_user_meta($user_id, 'coi_tags', $user_info['coiTags']);
        update_user_meta($user_id, 'lacv_code', $user_info['lacvCode']);
    }

    public function filter_content_by_clearance($content) {
        // Get current user's security attributes
        $user_id = get_current_user_id();
        $user_attributes = $this->get_user_security_attributes($user_id);
        
        // Get post security metadata
        $post_id = get_the_ID();
        $post_security = $this->get_post_security_metadata($post_id);
        
        // Check access using OPA
        $access_granted = $this->opa_service->check_access(
            $user_attributes,
            $post_security
        );
        
        if (!$access_granted) {
            return '<p>Access Denied: Insufficient clearance level or missing required access attributes.</p>';
        }
        
        return $content;
    }
}

// Initialize the plugin
add_action('plugins_loaded', ['DIVE25_Integration', 'get_instance']);