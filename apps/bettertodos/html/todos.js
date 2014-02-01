/* global angular, $, console, _ */
angular
	.module('todos', ['ui', 'indx'])
	.controller('todos', function ($scope, client, utils, staged) {
		'use strict';

		var urgencies = ['low', 'med', 'high', 'urgent'];

		var u = utils,
			newList,
			newTodo,
			app,
			box;

		var specialLists = [
			new Backbone.Model({ id: 'todo-list-all', title: ['All todos'], special: ['all'], todos: [] }),
			new Backbone.Model({ id: 'todo-list-completed', title: ['Completed'], special: ['completed'], todos: [] })
		];

		// Wait until user is logged in and a box has been selected
		var init = function (b) {
			console.log('init');

			box = b;
			$scope.box = b; // FIXME remove (just for console use)

			box.getObj('todoApp').then(function (a) {
				app = a;
				if (!app.has('lists')) { app.set('lists', []); }
				updateLists();
				app.on('change:lists', updateLists);
				u.safeApply($scope);
			});

		};

		// watches for login or box changes
		$scope.$watch('selectedBox + selectedUser', function () {
			delete $scope.msg;
			if (!$scope.selectedUser) {
				$scope.msg = 'Please log in.';
			} else if (!$scope.selectedBox) {
				$scope.msg = 'Please select a box.';
			} else {
				client.store.getBox($scope.selectedBox)
					.then(function (box) { init(box); })
					.fail(function (e) { u.error('error ', e); $scope.msg = 'An error occured.'; });
			}
			
		});

		// todo - check box is defined (or put in init)
		$scope.createList = function () {
			box.getObj('todoList-'  + u.uuid()).then(function (list) {
				list.set({ title: [''], 'todos': [] });
				newList = list;
				updateLists();
				list.isCreated = function () { return false; }
				$scope.editList(list);
			});
		};

		$scope.editList = function (list) {
			state.editingList = list;
			list.showDropdown = false;
		};

		$scope.selectList = function (list) {
			if (state.selectedList) {
				state.selectedList.off('change:todos', updateTodos);
			}
			state.selectedList = list;
			updateTodos();
			list.on('change:todos', updateTodos);
		};

		$scope.deleteList = function (list) {
			list.destroy().then(function () {
				var lists = app.get('lists');
				lists.splice(lists.indexOf(list), 1);
				app.save('lists', lists).then(function () {
					updateLists();
				});
			});
		};

		$scope.cancelEditList = function () {
			if (!state.editingList) { return; }
			console.log('cancel', state.editingList)
			state.editingList.staged.reset();
			delete state.editingList;
			newList = undefined;
			updateLists();
		};

		$scope.saveList = function (list) {
			var dfd = $.Deferred();
			list.loading = true;
			if (list.staged.get('title')[0] === '') {
				dfd.reject();
			} else {
				list.staged.save().then(function () {
					list.isCreated = function () { return true; }
					console.log('SAVED', list.get('title'),app.get('lists'), [list])
					if (list === newList) {
						newList = undefined;
						app.save('lists', app.get('lists').concat([list])).then(function () {
							dfd.resolve();
						});
					} else {
						dfd.resolve();
					}
				});
			}
			dfd.then(function () {
				delete state.editingList;
				updateLists();
			}).always(function () {
				delete list.loading;
			});
		};

		$scope.countTodos = function (list) {
			return list.get('todos').length;
		};


		var updateLists = function () {
			console.log('UPDATING LISTS', app.get('lists'));
			// update special lists;
			var specialAll = _.findWhere(specialLists, { id: 'todo-list-all' }),
				specialCompleted = _.findWhere(specialLists, { id: 'todo-list-completed' });

			specialAll.set('todos', _.reduce(app.get('lists'), function (memo, list) {
				return memo.concat(list.get('todos') || []);
			}, []));

			specialCompleted.set('todos', _.filter(specialAll.get('todos'), function (todo) {
				return (todo.get('completed') || [])[0];
			}));

			_.each(app.get('lists'), function (list) {
				if (!list.has('title')) { list.set('title', ['Untitled list']) }
				if (!list.has('todos')) { list.set('todos', []) }
				list.isCreated = function () { return true; }
			});

			$scope.lists = [].concat(app.get('lists'));

			delete state.isFirstList;
			if ($scope.lists.length === 0) {
				state.isFirstList = true;
			}
			if (newList) { $scope.lists.push(newList); }

			if ($scope.lists.length === 0) {
				$scope.createList();
				return;
			}

			$scope.lists = $scope.lists.concat(specialLists);

			_.each($scope.lists, function (list) {
				if (!list.staged) { staged(list); }
			})

			if (!state.selectedList) { $scope.selectList($scope.lists[0]); }

			$update();
		}

		var $update = function () {
			console.log('$UPDATE', state.editingList)
			u.safeApply($scope);
		};

		$scope.bodyClick = function () {
			console.log(this)
			$scope.lists.forEach(function (list) {
				list.showDropdown = false;
			});
		};



		// todo - check box is defined (or put in init)
		$scope.createTodoBefore = function (next) {
			box.getObj('todo-'  + u.uuid()).then(function (todo) {
				var todos = state.selectedList.get('todos'),
					prev = next ? next.get('prev') : todos[todos.length - 1];
				todo.set({
					title: [''],
					next: next ? [next] : undefined,
					prev: prev ? [prev] : undefined 
				});
				newTodo = todo;
				updateTodos();
				$scope.editTodo(todo);
			});
		};

		$scope.editTodo = function (todo) {
			state.editingTodo = todo;
		}

		$scope.cancelEditTodo = function () {
			delete state.editingTodo;
			newTodo = undefined;
			updateTodos();
		};

		$scope.saveTodo = function (todo) {
			var dfd = $.Deferred(),
				list = state.selectedList;
			todo.loading = true;
			console.log('SAVE', todo.get('title'), todo.toJSON())
			if (todo.get('title')[0] === '') {
				dfd.reject();
			} else {
				todo.save().then(function () {
					// update linked list
					var dfd1, dfd2,
						prev = todo.get('prev'),
						next = todo.get('next');
					console.log('np', next, prev)
					if (prev) { dfd1 = prev[0].save('next', [todo]); }
					if (next) { dfd2 = next[0].save('prev', [todo]); }
					console.log(todo, prev, next)
					$.when(dfd1, dfd2).then(function () {
						console.log('SAVED', list.get('title'))
						if (todo === newTodo) {
							newTodo = undefined;
							list.save('todos', list.get('todos').concat([todo])).then(function () {
								dfd.resolve();
							});
						} else {
							dfd.resolve();
						}
					});
				});
			}
			dfd.then(function () {
				delete state.editingTodo;
				delete todo.loading;
				updateTodos();
			});
		}

		var updateTodos = function () {
			var list = state.selectedList;
			console.log(list)
			$scope.todos = [];
			var nextTodo = _.find(list.get('todos'), function (todo) {
				return !todo.has('prev');
			});
			console.log('FIRST', nextTodo)
			while (nextTodo) {
				$scope.todos.push(nextTodo);
				nextTodo = nextTodo.has('next') ? nextTodo.get('next')[0] : undefined;
			}
			console.log($scope.todos)
			_.each($scope.todos, function (todo) {
				if (!todo.has('title')) { todo.set('title', ['Untitled todo']) }
				if (!todo.has('completed')) { todo.set('completed', [false]); }
			});
			if (newTodo) { $scope.todos.push(newTodo); }
			// todos is a linked list
			$update();
		};

		$scope.toggleTodoCompleted = function (todo) {
			todo.loading = true;
			todo.save('completed', [!todo.get('completed')[0]]).then(function () {
				todo.loading = false;
				updateTodos();
				updateLists();
			});
		};

		var state = $scope.s = {};

		window.$scope = $scope;


	}).directive('setFocus', function($timeout) {
		return {
			link: function($scope, element, attrs) {
				$scope.$watch(attrs.setFocus, function (value) {
					if (value === true) { 
						setTimeout(function () { element[0].focus(); });
					}
				});
			}
		};
	}).directive('clickElsewhere', function($document){
		return {
		restrict: 'A',
		link: function(scope, elem, attr, ctrl) {
			elem.bind('click', function(e) {
				// this part keeps it from firing the click on the document.
				e.stopPropagation();
			});
			$document.bind('click', function() {
				// magic here.
				scope.$apply(attr.clickElsewhere);
			})
			}
		}
	});