$(document).ready(function() {
    // Domain type switching
    $('input[name="domain_type"]').change(function() {
        const domainType = $(this).val();
        
        if (domainType === 'subdomain') {
            $('#subdomain_input').show();
            $('#custom_domain_input').hide();
            $('#subdomain_name').prop('required', true);
            $('#custom_domain_name').prop('required', false);
            $('#domain_help_text').text('Choose a subdomain (yourname.Hospx.app)');
            updateExpectedDomain();
        } else {
            $('#subdomain_input').hide();
            $('#custom_domain_input').show();
            $('#subdomain_name').prop('required', false);
            $('#custom_domain_name').prop('required', true);
            $('#domain_help_text').text('Enter your own custom domain (example.com)');
            updateExpectedDomain();
        }
    });

    // Update expected_domain hidden field
    function updateExpectedDomain() {
        const domainType = $('input[name="domain_type"]:checked').val();
        let expectedDomain = '';
        
        if (domainType === 'subdomain') {
            const subdomain = $('#subdomain_name').val();
            if (subdomain) {
                expectedDomain = subdomain + '.Hospx.app';
            }
        } else {
            expectedDomain = $('#custom_domain_name').val();
        }
        
        $('#expected_domain').val(expectedDomain);
    }

    // Update hidden field when user types
    $('#subdomain_name, #custom_domain_name').on('input', function() {
        updateExpectedDomain();
    });

    // Initialize
    updateExpectedDomain();

    // Email validation
    $('#checkEmail').click(function() {
        const email = $('#email').val();
        if (!email) {
            showValidation('email', false, 'Please enter an email address');
            return;
        }

        $.post('/api/validate-email', { email: email })
            .done(function(data) {
                if (data.exists) {
                    showValidation('email', false, 'Email already registered');
                } else {
                    showValidation('email', true, 'Email available');
                }
            })
            .fail(function() {
                showValidation('email', false, 'Error checking email');
            });
    });

    // Subdomain validation
    $('#checkSubdomain').click(function() {
        const subdomain = $('#subdomain_name').val();
        if (!subdomain) {
            showValidation('subdomain_name', false, 'Please enter a subdomain');
            return;
        }

        // Validate subdomain format
        const subdomainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
        if (!subdomainRegex.test(subdomain)) {
            showValidation('subdomain_name', false, 'Invalid subdomain format. Use only letters, numbers, and hyphens.');
            return;
        }

        if (subdomain.length < 3 || subdomain.length > 20) {
            showValidation('subdomain_name', false, 'Subdomain must be between 3-20 characters');
            return;
        }

        $.post('/api/validate-subdomain', { subdomain: subdomain })
            .done(function(data) {
                if (data.exists) {
                    showValidation('subdomain_name', false, 'Subdomain already registered');
                } else {
                    showValidation('subdomain_name', true, 'Subdomain available');
                    updateExpectedDomain();
                }
            })
            .fail(function() {
                showValidation('subdomain_name', false, 'Error checking subdomain');
            });
    });

    // Custom domain validation
    $('#checkCustomDomain').click(function() {
        const customDomain = $('#custom_domain_name').val();
        if (!customDomain) {
            showValidation('custom_domain_name', false, 'Please enter a custom domain');
            return;
        }

        // Validate domain format
        const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
        if (!domainRegex.test(customDomain)) {
            showValidation('custom_domain_name', false, 'Invalid domain format');
            return;
        }

        $.post('/api/validate-domain', { domain: customDomain })
            .done(function(data) {
                if (data.exists) {
                    showValidation('custom_domain_name', false, 'Domain already registered');
                } else {
                    showValidation('custom_domain_name', true, 'Domain available');
                    updateExpectedDomain();
                }
            })
            .fail(function() {
                showValidation('custom_domain_name', false, 'Error checking domain');
            });
    });

    // Reference code validation
    $('#validateRef').click(function() {
        const referenceCode = $('#reference_code').val();
        if (!referenceCode) {
            showValidation('reference_code', false, 'Please enter a reference code');
            return;
        }

        $.post('/api/validate-reference', { reference_code: referenceCode })
            .done(function(data) {
                if (data.valid) {
                    showValidation('reference_code', true, 'Valid reference code');
                    $('#referrer-name').text(data.referrer.name);
                    $('#referrer-info').show();
                } else {
                    showValidation('reference_code', false, 'Invalid reference code');
                    $('#referrer-info').hide();
                }
            })
            .fail(function() {
                showValidation('reference_code', false, 'Error validating reference code');
            });
    });

    // Form submission
    $('#registerForm').on('submit', function(e) {
        e.preventDefault();
        
        // Update expected_domain before submission
        updateExpectedDomain();
        
        // Validate required fields
        const domainType = $('input[name="domain_type"]:checked').val();
        const expectedDomain = $('#expected_domain').val();
        
        if (!expectedDomain) {
            if (domainType === 'subdomain') {
                showValidation('subdomain_name', false, 'Please enter a subdomain');
            } else {
                showValidation('custom_domain_name', false, 'Please enter a custom domain');
            }
            return;
        }
        
        $('#submitBtn').hide();
        $('.loading').show();
        
        this.submit();
    });

    function showValidation(fieldId, isValid, message) {
        const field = $('#' + fieldId);
        const messageDiv = field.closest('.mb-3').find('.validation-message');
        
        field.removeClass('is-valid is-invalid');
        field.addClass(isValid ? 'is-valid' : 'is-invalid');
        
        messageDiv.removeClass('text-success text-danger');
        messageDiv.addClass(isValid ? 'text-success' : 'text-danger');
        messageDiv.text(message);
    }
});