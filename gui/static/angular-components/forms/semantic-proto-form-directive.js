'use strict';

goog.provide('grrUi.forms.semanticProtoFormDirective.SemanticProtoFormController');
goog.provide('grrUi.forms.semanticProtoFormDirective.SemanticProtoFormDirective');


/**
 * Controller for SemanticProtoFormDirective.
 *
 * @constructor
 * @param {!angular.Scope} $scope
 * @param {!angular.Attributes} $attrs
 * @param {!grrUi.core.reflectionService.ReflectionService} grrReflectionService
 * @ngInject
 */
grrUi.forms.semanticProtoFormDirective.SemanticProtoFormController = function(
    $scope, $attrs, grrReflectionService) {
  /** @private {!angular.Scope} */
  this.scope_ = $scope;

  /** @type {?} */
  this.scope_.value;

  /** @private {!grrUi.core.reflectionService.ReflectionService} */
  this.grrReflectionService_ = grrReflectionService;

  /** @type {boolean} */
  this.advancedShown = false;

  /** @type {boolean} */
  this.hasAdvancedFields = false;

  /** @type {boolean} */
  this.expanded = false;

  /** @type {Object} */
  this.editedValue;

  if (angular.isDefined($attrs['hiddenFields']) &&
      angular.isDefined($attrs['visibleFields'])) {
    debugger;
    throw new Error('Either hidden-fields or visible-fields attribute may ' +
                    'be specified, not both.');
  }

  this.scope_.$watch('value', this.onValueChange_.bind(this));
  this.scope_.$watch('controller.editedValue.value',
                     this.onEditedValueChange_.bind(this),
                     true);

  this.boundNotExplicitlyHiddenFields =
      this.notExplicitlyHiddenFields_.bind(this);
};
var SemanticProtoFormController =
    grrUi.forms.semanticProtoFormDirective.SemanticProtoFormController;


/**
 * Filter function that returns true if the field wasn't explicitly mentioned
 * in 'hidden-fields' directive's argument.
 *
 * @param {string} field Name of a field.
 * @param {number=} opt_index Index of the field name in the names list
 *                            (optional).
 * @return {boolean} True if the field is not hidden, false otherwise.
 * @private
 */
SemanticProtoFormController.prototype.notExplicitlyHiddenFields_ = function(
    field, opt_index) {
  if (angular.isDefined(this.scope_['hiddenFields'])) {
    return this.scope_['hiddenFields'].indexOf(field['name']) == -1;
  } else if (angular.isDefined(this.scope_['visibleFields'])) {
    return this.scope_['visibleFields'].indexOf(field['name']) != -1;
  } else {
    return true;
  }
};

/**
 * Predicate that returns true only for regular (non-hidden, non-advanced)
 * fields.
 *
 * @param {Object} field Descriptor field to check.
 * @param {Number} index Descriptor field index.
 * @return {boolean}
 * @export
 */
SemanticProtoFormController.prototype.regularFieldsOnly = function(
    field, index) {
  return angular.isUndefined(field.labels) ||
      field.labels.indexOf('HIDDEN') == -1 &&
      field.labels.indexOf('ADVANCED') == -1;
};


/**
 * Predicate that returns true only for advanced (and non-hidden) fields.
 *
 * @param {Object} field Descriptor field to check.
 * @param {Number} index Descriptor field index.
 * @return {boolean}
 * @export
 */
SemanticProtoFormController.prototype.advancedFieldsOnly = function(
    field, index) {
  return angular.isDefined(field.labels) &&
      field.labels.indexOf('HIDDEN') == -1 &&
      field.labels.indexOf('ADVANCED') != -1;
};


/**
 * Handles changes of the value type.
 *
 * @param {?string} newValue
 * @param {?string} oldValue
 * @private
 */
SemanticProtoFormController.prototype.onValueChange_ = function(
    newValue, oldValue) {
  if (angular.isUndefined(newValue)) {
    this.descriptors = undefined;
    this.valueDescriptor = undefined;
    this.editedValue = undefined;
    return;
  }

  /**
   * Please note that if the value bound to the 'value' binding gets replaced
   * with a new object, the UI will get updated. But if one of the attributes
   * of the value bound to 'value' binding changes, then UI won't get updated,
   * because all the UI elements are not bound to 'editedValue' which only
   * gets updated when 'value' gets replaced.
   *
   * We consider this behavior OK for now, because there seems to be no
   * legitimate usecase of changing the contents of the currently edited value
   * from the outside.
   */
  if (newValue !== oldValue || angular.isUndefined(this.valueDescriptor)) {
    this.grrReflectionService_.getRDFValueDescriptor(
        this.scope_.value.type, true).then(
            this.onDescriptorsFetched_.bind(this));
  }
};

/**
 * Handles changes in the editedValue variable. editedValue contains
 * actual data that are being edited by the form controls. When it changes,
 * the changes are propagated to the main 'value' binding. This is done
 * in order not to set all the fields to their default values in 'value':
 * editedValue is initialized with all the default values, but 'value'
 * only changes when user actually inputs something.
 *
 * @param {Object} newValue
 * @param {Object} oldValue
 * @private
 */
SemanticProtoFormController.prototype.onEditedValueChange_ = function(
    newValue, oldValue) {
  if (angular.isDefined(newValue)) {
    /**
     * Only apply changes to scope_.value if oldValue is defined, i.e.
     * if the changes were actually made by the user editing the form.
     * oldValue === null means that editedValue was just initialized
     * from scope_.value, so no need to migrate any changes.
     */
    if (angular.isDefined(oldValue)) {
      /**
       * It's ok to traverse only the keys of newValue, because keys can't be
       * removed, only added.
       */
      angular.forEach(newValue, function(value, key) {
        if (!angular.equals(oldValue[key], newValue[key])) {
          this.scope_.value.value[key] = value;
        }
      }.bind(this));
    }

    /**
     *  Remove the fields that are equal to their default values (by
     *  "default" we mean either field default or value default).
     */
    angular.forEach(this.valueDescriptor['fields'], function(field) {
      if (this.notExplicitlyHiddenFields_(field)) {
        if (angular.isDefined(field['default'])) {
          if (angular.equals(this.scope_.value.value[field.name],
                             field['default'])) {
            delete this.scope_.value.value[field.name];
          }
        } else {
          // Field.type may be undefined for dynamic fields.
          if (field.type &&
              angular.equals(this.scope_.value.value[field.name],
                             this.descriptors[field.type]['default'])) {
            delete this.scope_.value.value[field.name];
          }
        }
      }
    }.bind(this));

  }
};


/**
 * Handles fetched reflection data.
 *
 * @param {!Object<string, Object>} descriptors
 * @private
 */
SemanticProtoFormController.prototype.onDescriptorsFetched_ = function(
    descriptors) {
  this.descriptors = descriptors;
  this.valueDescriptor = angular.copy(descriptors[this.scope_.value.type]);

  this.editedValue = angular.copy(this.scope_.value);
  if (angular.isUndefined(this.editedValue.value)) {
    this.editedValue.value = {};
  }

  angular.forEach(this.valueDescriptor['fields'], function(field) {
    if (angular.isDefined(field.labels)) {
      if (field.labels.indexOf('HIDDEN') != -1) {
        return;
      }

      if (field.labels.indexOf('ADVANCED') != -1) {
        this.hasAdvancedFields = true;
      }
    }

    if (field.repeated) {
      field.depth = 0;

      if (angular.isUndefined(this.editedValue.value[field.name])) {
        this.editedValue.value[field.name] = [];
      }
    } else {
      field.depth = (this.scope_.$eval('metadata.depth') || 0) + 1;

      if (angular.isUndefined(this.editedValue.value[field.name])) {
        if (angular.isDefined(field['default'])) {
          this.editedValue.value[field.name] = angular.copy(field['default']);
        } else {
          this.editedValue.value[field.name] = angular.copy(
              descriptors[field.type]['default']);
        }
      }
    }
  }.bind(this));
};

/**
 * SemanticProtoFormDirective renders a form corresponding to a given
 * RDFProtoStruct.
 *
 * @return {!angular.Directive} Directive definition object.
 */
grrUi.forms.semanticProtoFormDirective.SemanticProtoFormDirective = function() {
  return {
    scope: {
      value: '=',
      metadata: '=?',
      hiddenFields: '=?',
      visibleFields: '=?'
    },
    restrict: 'E',
    templateUrl: '/static/angular-components/forms/semantic-proto-form.html',
    controller: SemanticProtoFormController,
    controllerAs: 'controller'
  };
};


/**
 * Name of the directive in Angular.
 *
 * @const
 * @export
 */
grrUi.forms.semanticProtoFormDirective.SemanticProtoFormDirective
    .directive_name = 'grrFormProto';


/**
 * Semantic type corresponding to this directive.
 *
 * @const
 * @export
 */
grrUi.forms.semanticProtoFormDirective.SemanticProtoFormDirective
    .semantic_type = 'RDFProtoStruct';
