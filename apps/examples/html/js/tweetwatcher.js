/*global $,_,document,window,console,escape,Backbone,exports,WebSocket */
/*jslint vars:true, todo:true, sloppy:true */

angular
	.module('TwitterDemoApp', ['ui', 'indx'])
	.controller('TweetWatcher', function($scope, client, utils) {
		var u = utils, old_box;
		// TODO do soemthing more dramatic
	    
		var error = function(err) {	console.error(err); };
		var token_filter = function(x) {
			if (x.length === 0) return false;
			if (x.indexOf('http') === 0) return false;
			if (x.indexOf('#') === 0) return false;	// ignore hashtags
			if (x.indexOf('@') === 0) return false;	// ignore @ replies
			return true;
		};
		var parse_and_count = function(text) {
			var c = new Backbone.Model();
			text.split(' ').map(function(x) {
				var word = x.trim().toLowerCase();
				if (token_filter(word)) {
					c.attributes[word] = [(c.attributes[word] ? c.attributes[word][0] : 0) + 1];
				}
			});
			return c;
		};
		var sum_in = function(counts,new_counts) {
			new_counts.keys().map(function(k) {
				counts.set(k, (counts.get(k) ? counts.get(k)[0] : 0) + new_counts.get(k)[0]);
			});
		};		

		var loadtweets = function(box) {
			var counts = $scope.counts;
			// recount everything!
			if (counts) {
				counts.attributes = { '@id' : counts.id }; 
				// counts.keys().map(function(k) { if (k !== '@id') { counts.unset(k); } });
			}
			u.when(box.get_obj_ids().map(function(oid) { return box.get_obj(oid); }))
				.then(function() {
					_.toArray(arguments)
						.filter(function(x) {
							return x.get("text") !== undefined;
						}).map(function(obj) {
							sum_in(counts,parse_and_count(obj.get('text')[0]));
						});
					webbox.safe_apply($scope, function() { $scope._updated = new Date().valueOf(); });
					window.counts = counts;
					counts.save();
					counts.trigger('update-counts');
				}).fail(error);
		};

		var set_counts = function(obj) {
			webbox.safe_apply($scope, function() { $scope.counts = obj; });
		};
		
		var proceed = function(box) {
			box.get_obj('word_counts').then(function(obj) {
				// console.log('got obj word_counts >> ', obj);
				set_counts(obj);
				loadtweets(box);
				if (old_box !== undefined) {
					console.log("unsubscribing to old obox ****************************************************************** ");
					old_box.off('obj-add',undefined,$scope)
					old_box = box;
				}
				box.on('obj-add', function(oid) {
					box.get_obj(oid).then(function(object) {
						if (object.get("text")) {
							var newct = parse_and_count(object.get("text")[0]);
							sum_in($scope.counts, newct);
							// $scope.counts.save();
							$scope.counts.trigger('update-counts');											
						} else {
							// debug 
							console.warn('new object not a tweet, skipping ', object.id);
						}						
					}, $scope);
				});
			}).fail(error);
		};

	    var store = client.store;
	    store.toolbar.on('change:box', function(b) {
		if (b !== undefined) {
		    var box = store.get_box(b);
		    box.fetch().then(function() { store.trigger('box-loaded', box);}).fail(error);
		}
	    });		
	    store.on('box-loaded', proceed);
	    if (store.toolbar.is_logged_in() && store.toolbar.get_selected_box()) {
		console.log('logged in already setting selected ');
		var sb = store.get_box(store.toolbar.get_selected_box());
		old_box = sb;
		sb.fetch().then(proceed).fail(error); 
	    }
	});


