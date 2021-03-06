/**
 * Global helpers
 */
String.prototype.trim = function() {
	return this.replace(/^\s+|\s+$/g,'');
}

function empty(v)
{
	var k;
	if (v === '' || v === 0 || v === '0' || v === null || v === false || typeof v === 'undefined') {
		return true;
	}
	if (typeof v == 'object') {
		for (k in v) { return false; }
		return true;
	}
	return false;
}

// Avoid `console` errors in browsers that lack a console.
(function() {
    var method;
    var noop = function noop() {};
    var methods = [
        'assert', 'clear', 'count', 'debug', 'dir', 'dirxml', 'error',
        'exception', 'group', 'groupCollapsed', 'groupEnd', 'info', 'log',
        'markTimeline', 'profile', 'profileEnd', 'table', 'time', 'timeEnd',
        'timeStamp', 'trace', 'warn'
    ];
    var length = methods.length;
    var console = (window.console = window.console || {});

    while (length--) {
        method = methods[length];

        // Only stub undefined methods.
        if (!console[method]) {
            console[method] = noop;
        }
    }
}());

Sq.listen = function(event, callback)
{
	if (typeof Sq.eventListeners[event] !== 'object') {
		Sq.eventListeners[event] = [];
	}

	var ev = Sq.eventListeners[event];
	ev.push(callback);

	/* return a deregistration function
	 * for the event handler */
	return function() {
		var index = ev.indexOf(callback);
		ev.splice(index,1);
	};
}

Sq.trigger = function(event, data)
{
	if (typeof Sq.eventListeners[event] !== 'object') return;
	for (var i in Sq.eventListeners[event]) {
		Sq.eventListeners[event][i](data);
	}
}

/**
 * When Squi_Form attaches array data to a field, it encodes it
 * as faux json, with double-quotes converted to single so as to
 * to put it in one html data attribute.
 *
 * This decodes that string back into an object
 */
Sq.parse_fson = function(fson) {
	try {
		return $.parseJSON(fson.trim().replace(/'/g, '"'));
	} catch (e) {
		return null;
	}
}

/**
 * Activate form widgets
 * Given a context (usually an ajax-loaded form), this method
 * activates widgets based on fields' data attributes and classes
 */
Sq.activate_widgets = function($context) {
	if (typeof $context === 'undefined') {
		$context = document.body;
	}

	Sq.trigger('activate_widgets', {
		'context': $context
	})

	// Activate addon widgets
	$.each(Sq.widgets, function(selector, callback)
	{
		$(selector, $context).each(function(i, el)
		{
			callback($(el));
		});
	});
};


/**
 * Alert box
 * Adds a styled alert box to the passed $context (or the main container by default)
 * Types include 'message' (yellow), 'error' (red), 'success' (green), 'info' (blue)
 * By default hides preexisting alerts. Set 'append' to true to keep existing alerts.
 */
Sq.alert = function(type, message, $context, append) {
	// Default to main container
	if (typeof $context === 'undefined') {
		if ($('body > .container').length) {
			$context = $('body > .container');
		} else {
			$context = $('body > .fluid-container');
		}
	}

	Sq.trigger('alert', {
		'context': $context,
		'type': type,
		'message': message,
		'append': append
	});

	// Needs to be in a function due to the multiple scenarios below
	var add_alerts = function()
	{
		var $alert = $('<div class="alert alert-'+type+'"><a class="close" data-dismiss="alert" href="#">&times;</a>'+message+'</div>');
		console.log('Appending '+type+' alert to ', $context);
		$context.prepend($alert.hide().slideDown());
	};

	// Kill any existing alerts unless 'append' was specified
	var $existing = $('> .alert', $context);
	if ($existing.length && ! append) {
		$existing.slideUp(function(){
			$existing.remove();
			add_alerts();
		});
		return;
	}
	
	add_alerts();
};

/**
 * Reload Panel
 * Fetches new content for a panel based on the panel's URI,
 * specified in the data-uri attribute.
 */
Sq.reload_panel = function(panel_id, data, callback) {
	if (panel_id.jquery) {
		var $panel = panel_id;
		panel_id = $panel.attr('id');
	} else {
		var $panel = $('#'+panel_id);
	}

	if ( ! $panel.data('uri')) {
		return false;
	}

	Sq.trigger('reload_panel', {
		'panel': $panel,
		'uri': $panel.data('uri'),
		'data': data,
		'callback': callback
	});

	$.ajax({
		type: 'get',
		headers: {
			Accept: 'application/vnd.squire+partial,text/html;q=0.9,*/*;q=0.8'
		},
		dataType: 'html',
		data: data,
		url: Sq.site_url($panel.data('uri')),
		success: function(data){
			$panel.replaceWith(data);
			var $newPanel = $('#'+panel_id);
			if (typeof callback === 'function') callback($newPanel);
			Sq.activate_widgets($newPanel);
			Sq.trigger('partial.loaded', $newPanel);
		}
	});
};

/**
 * Ajax Submit
 * Validates, then submits a form ajaxically.
 * This method responds to JSON post-submit instructions from the server,
 * such as displaying an alert message ("message":"goes here"),
 * and reloading a panel ("reload_panel":"panel_id")
 *
 * @todo: React more intelligently to server-side validation errors
 * @todo: Move the $context parameter into options
 */
Sq.ajax_submit = function($form, $context, options) {
	if ( ! $form.valid()) {
		return false;
	}

	var $_context = $form;
	if ($context) {
		$_context = $context;
	} else if ($form.parent('.modal').length) {
		$_context = $form.parent('.modal:first');
	}
	
	var opt = {
		form: $form,
		context: $_context,
		load: function(e) {},
		success: function(data) {},
		error: function(jqXHR, textStatus) {}
	};
	$.extend(opt, options);

	Sq.trigger('ajax_submit', opt);

	$.ajax({
		url: $form.attr('action'),
		type: $form.attr('method'),
		data: $form.serialize(),
		success: function(data){
			// Trigger event
			Sq.trigger('form.success', {
				form: $form,
				data: data
			});

			// Call the user-defined event
			opt.success(data);

			// Sq events
			if (typeof data.events === 'object') {
				for (var i in data.events) {
					Sq.trigger(data.events[i], data);
				}
			}

			// Close the modal window
			if (typeof opt.context !== 'undefined' && opt.context.is('.modal')) {
				opt.context.modal('hide');
			}

			// User-defined callback function
			if (typeof data.callback !== 'undefined' && data.callback.length) {
				if (typeof window[data.callback] !== 'undefined') {
					window[data.callback](data);
				} else {
					console.log('Tried to call undefined callback', data.callback);
				}
			}

			// Show a message if we got one
			if (typeof data.message !== 'undefined' && data.message.length) {
				Sq.alert('success', data.message);
			}

			// Reload a panel, maybe?
			if (typeof data.reload_panel !== 'undefined' && data.reload_panel.length) {
				// Cast the value as an array
				if (typeof data.reload_panel != 'object') {
					data.reload_panel = [data.reload_panel];
				}
				$.each(data.reload_panel, function(i, panel) {
					Sq.reload_panel(panel);
				});
			}
			
			// Redirect to another page?
			if (typeof data.redirect !== 'undefined' && data.redirect.length) {
				window.location = Sq.site_url(data.redirect);
			}
		},
		error: function(xhr, status) {
			var response;

			// Try to parse the response as JSON
			try {
				response = $.parseJSON(xhr.responseText);
			} catch(error) {
				console.log('Non-JSONized error: ', error);
				opt.error(xhr, status);
				return;
			}

			// Trigger event
			Sq.trigger('form.error', {
				form: $form,
				data: response
			});

			// Call the user-defined event
			opt.error(response);

			// Show a message if we got one
			if (typeof response.message !== 'undefined')
			{
				Sq.alert('error', '<p>'+response.message+'</p>', $form);
			}

			// Show validation errors
			if (typeof response.errors !== 'undefined') {
				var errors = [];
				for (var field in response.errors)
				{
					$('[name='+field+']', $form).closest('.control-group').addClass('error');
					errors.push(response.errors[field]);
				}
				Sq.alert('error', '<p>'+errors.join('</p><p>')+'</p>', $form);
			}
		}
	});
};

/**
 * Prepare Modal Dialog
 * Prepares markup for form dialogs by activating widgets and validation
 */
Sq.prepare_modal = function($modal, options) {
	// Options to be passed to Sq.ajax_submit()
	var opt = {
		success: function(data) {},
		error: function(response) {}
	};
	$.extend(opt, options);
	
	// We can indicate which form element to
	// focus using .focus, otherwise, we use
	// the first form element

	if($modal.find('.focus').length) {
		$modal.find('.focus').focus();
	}	else {
		$modal.find('input[type!=hidden]:first').focus();
	}

	// Run addon hooks
	for (var i in Sq.dialog_callbacks)
	{
		Sq.dialog_callbacks[i]($modal);
	}
	
	// The rest only applies to form dialogs
	if ( ! $modal.is('.form-modal')) { return; }

	Sq.activate_widgets($modal);

	var $form = $modal.find('form:first:not(.manual)');
	var val = {};
	$form.find('input, textarea, select').each(function(){
		var rules = $(this).data('validation');
		var field = $(this).attr('name');
		if ( ! rules) { return; }
		try {
			rules = $.parseJSON(rules.trim().replace(/'/g, '"'));
		} catch (e) {
			console.log('Could not parse validation rules for '+field+': '+rules.trim().replace(/'/g, '"'));
			return;
		}
		val[field] = {};
		var translate = {
			'regex': function(pattern){
				// Take the control characters out
				//pattern = pattern.substr(1, pattern.length-2).replace(/\\/g, '\\\\');
				pattern = pattern.substr(1, pattern.length-2);
				return {
					name: 'pattern',
					arg: new RegExp(pattern)
				};
			}
		};
		for (var name in rules) {
			var rule = rules[name];

			// Translate from server-side terms
			if (typeof translate[name] !== 'undefined')
			{
				var newRule = translate[name](rule);
				rule = newRule.arg;
				name = newRule.name;
			}

			if (typeof rule === 'string' && ! rule.arg.length)
			{
				rule = true;
			}

			// Join the rule array just in case there were colons in the arguments
			val[field][name] = rule;
		}
	});

	val = {
		ignore: ':hidden',
		errorClass: 'error',
		validClass: 'success',
		errorElement: 'span',
		highlight: function(element, errorClass, validClass) {
			if (element.type === 'radio') {
				this.findByName(element.name).parent('div').parent('div').removeClass(validClass).addClass(errorClass);
			} else {
				$(element).parent('div').parent('div').removeClass(validClass).addClass(errorClass);
			}
		},
		unhighlight: function(element, errorClass, validClass) {
			if (element.type === 'radio') {
				this.findByName(element.name).parent('div').parent('div').removeClass(errorClass).addClass(validClass);
			} else {
				$(element).parent('div').parent('div').removeClass(errorClass).addClass(validClass);
			}
		},
		rules: val
	};

	if (val.rules.length)
	{
		$form.validate(val);
	}
	//console.log(val.rules);

	$form.submit(function(e)
	{
		e.preventDefault();
		Sq.ajax_submit($(this), $(this).parents('.form-modal'), opt);

		return false;
	});
};

Sq.modal = function(options)
{
	var opt = {
		url: '',
		success: function($modal) {},        // dialog loaded successfully
		error: function(response) {},           // dialog load error. response will be either responseText or json-parsed object
		submit_success: function(data) {},   // called when form inside dialog submits successfully
		submit_error: function(response) {}, // called when form inside dialog has ajax error
	};
	$.extend(opt, options);

	Sq.trigger('modal', opt);

	$.ajax({
		url: options.url,
		type: 'GET',
		headers: {
			Accept: 'application/vnd.squire+dialog,text/html;q=0.9,*/*;q=0.8'
		},
		dataType: 'html',
		success: function(data)
		{
			var $modal = $(data);
			if ($modal.length > 1 || ! $modal.is('.modal')) {
				console.log(data, $(data).find('div.modal:first'), $(data));
				// Create a modal with whatever was returned
				$modal = $('<div class="modal"></div>')
					.append($('<div class="modal-header"></div>')
						.append('<a href="#" class="close" data-dismiss="modal">x</a>')
						.append('<h3>Error Loading Dialog</h3>'))
					.append($('<div class="modal-body"></div')
						.append(data))
					.append($('<div class="modal-footer"></div>')
						.append('<a href="#" class="btn" data-dismiss="modal">Close</a>'))
					.modal();
				opt.success($modal);
				return;
			}
			$modal.addClass('fade').modal();

			$modal.on('shown', function() {
				Sq.prepare_modal($modal, {
					success: opt.submit_success,
					error: opt.submit_error
				});
			});
			opt.success($modal);
		},
		error: function(xhr, status)
		{
			opt.error(xhr.responseText);
		}
	});
};

Sq.unsavedChanges = [];
Sq.addUnsavedChange = function(item) {
	if (Sq.unsavedChanges.indexOf(item) < 0) {
		Sq.unsavedChanges.push(item);
	}
};
Sq.removeUnsavedChange = function(item) {
	var i = Sq.unsavedChanges.indexOf(item);
	if (i >= 0) {
		Sq.unsavedChanges.splice(i, 1);
	}
};

/**
 * On page ready, make all the magic happen
 */
$(function() {

	// Make all ajax requests accept JSON responses
	$.ajaxSetup({
		accept: 'application/json',
		dataType: 'json'
	});

	// Clickable table rows
	$(document).on('click', '.clickable:not(.ajax)', function(e){
		e.preventDefault();
		var uri = $(this).data('uri');
		if ($(this).is('.ajax'))
		{
			Sq.modal({
				url: Sq.site_url(uri)
			});
			return false;
		}
		window.location = Sq.site_url(uri);
	});

	// Modal links
	$(document).on('click', '.ajax', function(e){
		var url = (typeof this.href === 'undefined')
			? Sq.site_url($(this).data('uri'))
			: this.href;

		Sq.modal({
			url: url
		});
		
		return false;
	});

	// Trigger form submission when user clicks primary dialog button
	$(document).on('click', '.form-modal .btn-primary', function(e)
	{
		var $dialog = $(this).parents('.form-modal');
		Sq.trigger('dialog_save_clicked', { dialog: $dialog });

		var $buttons = $dialog.find('.modal-footer .btn');
		$buttons.attr('disabled', 'disabled');

		// Submit the form contained in the modal
		$dialog.find('form:first').submit();
		return false;
	});

	// Confirm before leaving page with unsaved changes
	window.onbeforeunload = confirmExit;
	function confirmExit()
	{
		if ( ! Sq.unsavedChanges.length) return;
		return "There are unsaved changes on this page. Leaving this page will discard any unsaved changes.";
	}

	

	// Activate any widgets on this page
	Sq.activate_widgets();

});
